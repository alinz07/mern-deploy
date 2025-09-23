// backend/routes/months.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Month = require("../models/Month");
const Day = require("../models/Day");

// helper: make sure a month has its 31 day docs
async function ensureDaysForMonth(monthId, userId) {
	// Upsert Day(1..31) for this month & user
	const ops = Array.from({ length: 31 }, (_, i) => {
		const dayNum = i + 1;
		return {
			updateOne: {
				filter: { month: monthId, dayNumber: dayNum },
				update: {
					// always (re)assert ownership
					$set: { userId },
					// be explicit about what to create if missing
					$setOnInsert: { month: monthId, dayNumber: dayNum },
				},
				upsert: true,
			},
		};
	});

	await Day.bulkWrite(ops, { ordered: false });
}

// POST /api/months/new
router.post("/new", auth, async (req, res) => {
	try {
		const { name } = req.body;
		if (!name)
			return res.status(400).json({ msg: "Month name is required" });

		// find-or-create month per user (admin still creates under their own userId)
		let month = await Month.findOne({ name, userId: req.user.id });

		if (!month) {
			month = await Month.create({ name, userId: req.user.id });
			// new resource -> 201
			await ensureDaysForMonth(month._id, req.user.id);
			return res.status(201).json(month);
		} else {
			// month existed; still ensure the 31 day docs exist -> 200
			await ensureDaysForMonth(month._id, req.user.id);
			return res.status(200).json(month);
		}
	} catch (e) {
		console.error("POST /months/new failed:", e);
		res.status(500).json({ msg: "Server error", error: e.message });
	}
});

module.exports = router;
