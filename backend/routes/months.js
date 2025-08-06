const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Month = require("../models/Month");

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

	if (!name) {
		return res.status(400).json({ msg: "Month name is required" });
	}

	try {
		const newMonth = new Month({
			name,
			userId: req.user.id,
		});

		const savedMonth = await newMonth.save();
		res.json(savedMonth);
	} catch (err) {
		console.error("Error creating month:", err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
