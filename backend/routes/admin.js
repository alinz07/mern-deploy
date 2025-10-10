// backend/routes/admin.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const AdminUser = require("../models/AdminUser");

// GET /api/admin/join-code  (admin only)
router.get("/join-code", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin") {
			return res.status(403).json({ msg: "Admin only" });
		}

		// Prefer the adminUser id on the JWT; fall back to ownerUser lookup
		let org = null;
		if (
			req.user.adminUser &&
			mongoose.isValidObjectId(req.user.adminUser)
		) {
			org = await AdminUser.findById(req.user.adminUser).lean();
		} else {
			org = await AdminUser.findOne({ ownerUser: req.user.id }).lean();
		}

		if (!org) return res.status(404).json({ msg: "Admin org not found" });

		return res.json({ joinCode: org.joinCode, name: org.name });
	} catch (e) {
		console.error("GET /api/admin/join-code", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
