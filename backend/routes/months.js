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

// POST create a new month
router.post("/new", auth, async (req, res) => {
	const { name } = req.body;

	if (!name) return res.status(400).json({ msg: "Month name is required" });

	try {
		// Prevent duplicates per user
		const existing = await Month.findOne({
			name,
			userId: req.user.id,
		});

		if (existing) {
			return res.status(400).json({ msg: "Month already exists" });
		}

		const newMonth = new Month({
			name,
			userId: req.user.id,
		});

		const saved = await newMonth.save();
		res.status(201).json(saved);
	} catch (err) {
		console.error("Failed to add month:", err.message);
		res.status(500).send("Server Error");
	}
});

router.post("/new", auth, async (req, res) => {
	try {
		const { name } = req.body;
		if (!name) return res.status(400).json({ msg: "Name is required" });

		// prevent duplicates per owner unless admin (admin can create global months if you want)
		const exists = await Month.findOne({ name, owner: req.user.id });
		if (exists)
			return res.status(400).json({ msg: "Month already exists" });

		const month = await Month.create({ name, owner: req.user.id });

		// seed 31 Day docs
		const days = Array.from({ length: 31 }, (_, i) => ({
			dayNumber: i + 1,
			month: month._id,
			owner: req.user.id,
		}));
		await Day.insertMany(days);

		return res.status(201).json(month);
	} catch (e) {
		res.status(500).json({ msg: "Server error", error: e.message });
	}
});
module.exports = router;
