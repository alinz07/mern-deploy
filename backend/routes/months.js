// backend/routes/months.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Month = require("../models/Month");
const Day = require("../models/Day");

/**
 * Ensure a month has Day(1..31) documents for the given user.
 * - Sequential, explicit upserts (simplest + most robust on all hosts)
 * - $setOnInsert for { month, dayNumber } so inserts are complete
 * - $set for { userId } to keep ownership consistent
 * - Ignores duplicate-key noise; throws on anything else
 */
async function ensureDaysForMonth(monthId, userId) {
	for (let dayNumber = 1; dayNumber <= 31; dayNumber++) {
		try {
			await Day.updateOne(
				{ month: monthId, dayNumber },
				{
					$set: { userId },
					$setOnInsert: { month: monthId, dayNumber },
				},
				{ upsert: true }
			);
		} catch (err) {
			// Duplicate key is fine (another request already created it)
			const msg = err && err.message ? err.message : String(err);
			const isDup =
				msg.includes("E11000") ||
				(err.code && Number(err.code) === 11000);

			if (isDup) {
				// Keep going; this just means the day already exists.
				continue;
			}

			console.error(
				`ensureDaysForMonth: failed for day ${dayNumber} of month ${monthId}: ${msg}`
			);
			// Bubble up real errors so the route returns a 500 with details
			throw err;
		}
	}
}

/**
 * GET /api/months
 * Admin sees all; non-admin sees only their months.
 * Populates owner username.
 */
router.get("/", auth, async (req, res) => {
	try {
		const filter =
			req.user.username === "admin" ? {} : { userId: req.user.id };

		const months = await Month.find(filter)
			.sort({ name: 1 })
			.populate("userId", "username");

		res.json(months);
	} catch (err) {
		console.error("Error fetching months:", err?.message || err);
		res.status(500).send("Server Error");
	}
});

/**
 * POST /api/months/new
 * Find-or-create a month for the current user by `name`,
 * then ALWAYS ensure 31 Day docs exist for that month & user.
 * Returns:
 * - 201 with month when newly created
 * - 200 with month when it already existed
 */
router.post("/new", auth, async (req, res) => {
	try {
		const { name } = req.body;
		if (!name) {
			return res.status(400).json({ msg: "Month name is required" });
		}

		// Find-or-create per user (admin creates under their own userId here)
		let month = await Month.findOne({ name, userId: req.user.id });

		if (!month) {
			month = await Month.create({ name, userId: req.user.id });
			await ensureDaysForMonth(month._id, req.user.id);
			return res.status(201).json(month);
		}

		// Month already exists -> still ensure its 31 days
		await ensureDaysForMonth(month._id, req.user.id);
		return res.status(200).json(month);
	} catch (e) {
		console.error("POST /api/months/new failed:", e?.message || e);
		return res
			.status(500)
			.json({ msg: "Server error", error: e?.message || String(e) });
	}
});

/**
 * GET /api/months/:id
 * Owner or admin only.
 */
router.get("/:id", auth, async (req, res) => {
	try {
		const m = await Month.findById(req.params.id);
		if (!m) return res.status(404).json({ msg: "Not found" });

		if (req.user.username !== "admin" && String(m.userId) !== req.user.id) {
			return res.status(403).json({ msg: "Forbidden" });
		}

		res.json(m);
	} catch (e) {
		console.error("GET /months/:id failed:", e?.message || e);
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
