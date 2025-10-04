const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const EquipmentCheck = require("../models/EquipmentCheck");
const Month = require("../models/Month");
const Day = require("../models/Day");
const User = require("../models/User");

// admin-only guard
function requireAdmin(req, res) {
	if (req.user.role !== "admin") {
		res.status(403).json({ msg: "Admin only" });
		return false;
	}
	return true;
}

// POST create/upsert
router.post("/", auth, async (req, res) => {
	try {
		if (!requireAdmin(req, res)) return;
		const { user, month, day, left, right, both, fmMic } = req.body || {};
		if (![user, month, day].every(mongoose.isValidObjectId))
			return res.status(400).json({ msg: "user, month, day required" });

		const [u, m, d] = await Promise.all([
			User.findById(user).lean(),
			Month.findById(month).lean(),
			Day.findById(day).lean(),
		]);
		if (!u || !m || !d)
			return res.status(404).json({ msg: "Related doc not found" });
		if (
			String(u.adminUser) !== String(req.user.adminUser) ||
			String(m.adminUser) !== String(req.user.adminUser)
		)
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });

		const doc = await EquipmentCheck.findOneAndUpdate(
			{ user, month, day },
			{
				$setOnInsert: { user, month, day },
				$set: { left, right, both, fmMic },
			},
			{ new: true, upsert: true }
		);
		res.json(doc);
	} catch (e) {
		console.error("POST /equipment-checks error:", e);
		res.status(500).json({ msg: "Server error" });
	}
});

// GET by user (admin only)
router.get("/by-user/:userId", auth, async (req, res) => {
	try {
		if (!requireAdmin(req, res)) return;
		const { userId } = req.params;
		if (!mongoose.isValidObjectId(userId))
			return res.status(400).json({ msg: "Invalid id" });
		res.json(
			await EquipmentCheck.find({ user: userId }).sort({ createdAt: -1 })
		);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
