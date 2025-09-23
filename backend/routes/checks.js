// routes/checks.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth"); // your existing JWT auth
const Check = require("../models/Check");
const Day = require("../models/Day");

// Ensure a Check exists for (dayId, current user) and return it
router.post("/", auth, async (req, res) => {
	try {
		const { dayId } = req.body;
		if (!dayId || !mongoose.isValidObjectId(dayId)) {
			return res.status(400).json({ msg: "dayId is required" });
		}

		// Validate Day exists (and belongs to this user or is visible per your existing rules)
		const day = await Day.findById(dayId).lean();
		if (!day) return res.status(404).json({ msg: "Day not found" });

		// Upsert one Check per (day, user)
		const check = await Check.findOneAndUpdate(
			{ day: dayId, user: req.user.id },
			{ $setOnInsert: { day: dayId, user: req.user.id } },
			{ new: true, upsert: true }
		);

		res.json(check);
	} catch (err) {
		console.error("POST /api/checks error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

// Get checks for a day
// - Regular user: returns only **their** check for that day (0 or 1 doc)
// - Admin with ?all=1: returns all users' checks for that day
router.get("/", auth, async (req, res) => {
	try {
		const { dayId, all } = req.query;
		if (!dayId || !mongoose.isValidObjectId(dayId)) {
			return res.status(400).json({ msg: "dayId is required" });
		}

		const query =
			req.user.role === "admin" && all === "1"
				? { day: dayId }
				: { day: dayId, user: req.user.id };

		const checks = await Check.find(query).lean();
		res.json(checks);
	} catch (err) {
		console.error("GET /api/checks error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

// Update booleans on a Check
router.patch("/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await Check.findById(id);
		if (!doc) return res.status(404).json({ msg: "Check not found" });

		// Owner or admin only
		if (doc.user.toString() !== req.user.id && req.user.role !== "admin") {
			return res.status(403).json({ msg: "Forbidden" });
		}

		const fields = [
			"checkone",
			"checktwo",
			"checkthree",
			"checkfour",
			"checkfive",
		];
		fields.forEach((f) => {
			if (typeof req.body[f] === "boolean") doc[f] = req.body[f];
		});

		await doc.save();
		res.json(doc);
	} catch (err) {
		console.error("PATCH /api/checks/:id error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
