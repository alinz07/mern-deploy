const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Day = require("../models/Day");
const Month = require("../models/Month");

// GET /api/days?monthId=...
router.get("/", auth, async (req, res) => {
	try {
		const { monthId } = req.query;
		if (!monthId) {
			return res.status(400).json({ msg: "monthId is required" });
		}

		// Verify month exists and determine owner
		const month = await Month.findById(monthId).select("userId name");
		if (!month) return res.status(404).json({ msg: "Month not found" });

		// Only allow owner or admin
		if (
			req.user.username !== "admin" &&
			String(month.userId) !== req.user.id
		) {
			return res.status(403).json({ msg: "Access denied" });
		}

		const filter =
			req.user.username === "admin"
				? { monthId }
				: { monthId, userId: req.user.id };

		const days = await Day.find(filter).sort({ day: 1 });
		res.json({ monthName: month.name, days });
	} catch (err) {
		console.error("Error fetching days:", err.message);
		res.status(500).send("Server Error");
	}
});

// POST /api/days/new  { monthId, day, isoDate?, notes? }
router.post("/new", auth, async (req, res) => {
	try {
		const { monthId, day, isoDate, notes } = req.body;
		if (!monthId || !day) {
			return res
				.status(400)
				.json({ msg: "monthId and day are required" });
		}

		// Verify month exists and determine owner
		const month = await Month.findById(monthId).select("userId name");
		if (!month) return res.status(404).json({ msg: "Month not found" });

		// Only owner or admin may create
		if (
			req.user.username !== "admin" &&
			String(month.userId) !== req.user.id
		) {
			return res.status(403).json({ msg: "Access denied" });
		}

		const doc = new Day({
			monthId,
			userId: req.user.username === "admin" ? month.userId : req.user.id,
			day,
			isoDate: isoDate || undefined,
			notes: notes || "",
		});

		const saved = await doc.save();
		res.status(201).json(saved);
	} catch (err) {
		if (err.code === 11000) {
			// Unique index violation (monthId, day)
			return res
				.status(400)
				.json({ msg: "Day already exists for this month" });
		}
		console.error("Error creating day:", err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
