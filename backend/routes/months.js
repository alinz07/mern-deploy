const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Month = require("../models/Month");
const Day = require("../models/Day");

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

router.post("/new", auth, async (req, res) => {
	try {
		const { name } = req.body;
		if (!name)
			return res.status(400).json({ msg: "Month name is required" });

		// prevent duplicates per userId unless admin (admin can create global months if you want)
		const exists = await Month.findOne({ name, userId: req.user.id });
		if (exists)
			return res.status(400).json({ msg: "Month already exists" });

		const month = await Month.create({ name, userId: req.user.id });

		// seed 31 Day docs
		await Day.bulkWrite(
			Array.from({ length: 31 }, (_, i) => ({
				updateOne: {
					filter: { month: month._id, dayNumber: i + 1 },
					update: { $setOnInsert: { userId: req.user.id } }, // <-- userId, not owner
					upsert: true,
				},
			}))
		);
		return res.status(201).json(month);
	} catch (e) {
		res.status(500).json({ msg: "Server error", error: e.message });
	}
});

// backend/routes/months.js
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
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
