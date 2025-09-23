const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Month = require("../models/Month");
const Day = require("../models/Day");

/**
 * Ensure a month has Day(1..31) documents for the given user.
 * Idempotent: safe to run multiple times.
 */
async function ensureDaysForMonth(monthId, userId) {
	const ops = Array.from({ length: 31 }, (_, i) => {
		const dayNumber = i + 1;
		return {
			updateOne: {
				filter: { month: monthId, dayNumber },
				update: {
					// Always assert ownership (keeps in sync if userId was ever missing)
					$set: { userId },
					// Only set these when inserting a new Day
					$setOnInsert: { month: monthId, dayNumber },
				},
				upsert: true,
			},
		};
	});

	await Day.bulkWrite(ops, { ordered: false });
}

// GET all months (admin sees all, others see their own)
router.get("/", auth, async (req, res) => {
	try {
		const filter =
			req.user.username === "admin" ? {} : { userId: req.user.id };

		// 👇 Populate the username of the user who owns the month
		const months = await Month.find(filter)
			.sort({ name: 1 })
			.populate("userId", "username");

		res.json(months);
	} catch (err) {
		console.error("Error fetching months:", err.message);
		res.status(500).send("Server Error");
	}
});

// Create month if missing; always ensure 31 days
router.post("/new", auth, async (req, res) => {
	try {
		const { name } = req.body;
		if (!name) {
			return res.status(400).json({ msg: "Month name is required" });
		}

		// Find-or-create per user
		let month = await Month.findOne({ name, userId: req.user.id });

		if (!month) {
			// Create new month
			month = await Month.create({ name, userId: req.user.id });
			await ensureDaysForMonth(month._id, req.user.id);
			return res.status(201).json(month);
		}

		// Month already exists -> still ensure 31 days, then return 200
		await ensureDaysForMonth(month._id, req.user.id);
		return res.status(200).json(month);
	} catch (e) {
		console.error("POST /months/new failed:", e);
		return res.status(500).json({ msg: "Server error", error: e.message });
	}
});

// GET a single month by id (owner or admin only)
router.get("/:id", auth, async (req, res) => {
	try {
		const m = await Month.findById(req.params.id);
		if (!m) return res.status(404).json({ msg: "Not found" });

		// Only allow user (or admin) to read
		if (req.user.username !== "admin" && String(m.userId) !== req.user.id) {
			return res.status(403).json({ msg: "Forbidden" });
		}

		res.json(m);
	} catch (e) {
		console.error("GET /months/:id failed:", e);
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
