const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const EquipmentCheck = require("../models/EquipmentCheck");
const Month = require("../models/Month");
const Day = require("../models/Day");
const User = require("../models/User");

// NEW: cascade
const EquipComment = require("../models/EquipComment");

// admin-only guard
function requireAdmin(req, res) {
	if (req.user.role !== "admin") {
		res.status(403).json({ msg: "Admin only" });
		return false;
	}
	return true;
}

// POST /api/equipment-checks
router.post("/", auth, async (req, res) => {
	try {
		const { user, month, day, left, right, both, fmMic } = req.body || {};
		if (![user, month, day].every(mongoose.isValidObjectId))
			return res.status(400).json({ msg: "user, month, day required" });

		// allow if admin OR the logged-in user is the owner
		const isAdmin = req.user.role === "admin";
		const isSelf = String(req.user._id) === String(user);
		if (!isAdmin && !isSelf)
			return res.status(403).json({ msg: "Forbidden" });

		// tenant safety: user/month must belong to the same adminUser as the caller
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

// GET /for-day (admin-only)
router.get("/for-day", auth, async (req, res) => {
	try {
		if (!requireAdmin(req, res)) return;
		const { user, month, day } = req.query;
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

		const doc = await EquipmentCheck.findOne({ user, month, day }).lean();
		if (!doc) return res.status(404).json({ msg: "Not found" });
		res.json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

// PATCH /:id (admin-only)
router.patch("/:id", auth, async (req, res) => {
	try {
		if (!requireAdmin(req, res)) return;
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await EquipmentCheck.findById(id);
		if (!doc) return res.status(404).json({ msg: "Not found" });

		const [u, m] = await Promise.all([
			User.findById(doc.user).select("adminUser").lean(),
			Month.findById(doc.month).select("adminUser").lean(),
		]);
		if (
			!u ||
			!m ||
			String(u.adminUser) !== String(req.user.adminUser) ||
			String(m.adminUser) !== String(req.user.adminUser)
		)
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });

		["left", "right", "both", "fmMic"].forEach((f) => {
			if (typeof req.body[f] === "boolean") doc[f] = req.body[f];
		});

		await doc.save();
		res.json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

// NEW: DELETE /:id  (admin-only, cascade EquipComment)
router.delete("/:id", auth, async (req, res) => {
	try {
		if (!requireAdmin(req, res)) return;
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await EquipmentCheck.findById(id).lean();
		if (!doc) return res.status(404).json({ msg: "Not found" });

		// tenant check
		const [u, m] = await Promise.all([
			User.findById(doc.user).select("adminUser").lean(),
			Month.findById(doc.month).select("adminUser").lean(),
		]);
		if (
			!u ||
			!m ||
			String(u.adminUser) !== String(req.user.adminUser) ||
			String(m.adminUser) !== String(req.user.adminUser)
		)
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });

		await EquipComment.deleteMany({ equipmentCheck: id });
		await EquipmentCheck.deleteOne({ _id: id });

		return res.json({ deleted: true });
	} catch (e) {
		return res.status(500).json({ msg: "Server error" });
	}
});

// existing list by user (admin-only)
router.get("/by-user/:userId", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
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
