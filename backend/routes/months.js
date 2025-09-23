const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Month = require("../models/Month");
const Day = require("../models/Day");

/**
 * Ensure a month has Day(1..31) documents for the given user.
 * Strategy:
 *  1) Find existing dayNumbers for this month
 *  2) Insert missing via insertMany({ordered:false})  (fast path)
 *  3) If that throws, fall back to individual upserts (slow but unkillable)
 */
async function ensureDaysForMonth(monthId, userId) {
	// Find existing days (only project number to keep it light)
	const existing = await Day.find(
		{ month: monthId },
		{ dayNumber: 1, _id: 0 }
	).lean();
	const have = new Set(existing.map((d) => d.dayNumber));

	const missingDocs = [];
	for (let i = 1; i <= 31; i++) {
		if (!have.has(i)) {
			missingDocs.push({
				dayNumber: i,
				month: monthId,
				userId: userId,
			});
		}
	}

	if (missingDocs.length === 0) return { inserted: 0, fallbackUpserts: 0 };

	// Fast path: bulk insert only what’s missing
	try {
		const inserted = await Day.insertMany(missingDocs, { ordered: false });
		return { inserted: inserted.length, fallbackUpserts: 0 };
	} catch (e) {
		// If the schema has extra required fields or an index race happened,
		// fall back to idempotent upserts and keep going no matter what.
		console.warn(
			"ensureDaysForMonth: insertMany failed, falling back to upserts:",
			e?.message || e
		);

		let ok = 0;
		for (const doc of missingDocs) {
			try {
				await Day.updateOne(
					{ month: monthId, dayNumber: doc.dayNumber },
					{
						$setOnInsert: {
							month: monthId,
							dayNumber: doc.dayNumber,
						},
						$set: { userId: userId },
					},
					{ upsert: true }
				);
				ok++;
			} catch (err) {
				console.error(
					`ensureDaysForMonth: upsert failed for day ${doc.dayNumber}:`,
					err?.message || err
				);
			}
		}
		return { inserted: 0, fallbackUpserts: ok };
	}
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

// Create a month if missing; ALWAYS ensure 31 days exist for it.
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

			const result = await ensureDaysForMonth(month._id, req.user.id);
			// Helpful, non-fatal telemetry in the response (you can remove later)
			return res
				.status(201)
				.json({ ...month.toObject(), _telemetry: result });
		}

		// Month already exists -> still ensure 31 days
		const result = await ensureDaysForMonth(month._id, req.user.id);
		return res
			.status(200)
			.json({ ...month.toObject(), _telemetry: result });
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
