// backend/routes/admin.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const AdminUser = require("../models/AdminUser");
const User = require("../models/User"); // ✅ FIX: import User model

// GET /api/admin/join-code  (admin only)
router.get("/join-code", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin") {
			return res.status(403).json({ msg: "Admin only" });
		}

		// Prefer adminUser id from token; fallback to owner lookup
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

// GET /api/admin/contact-email  → returns the admin email for the logged-in user
router.get("/contact-email", auth, async (req, res) => {
	try {
		// If the caller is an admin, send to the admin's own email.
		if (req.user.role === "admin") {
			const adminUserDoc = await User.findById(req.user.id)
				.select("email")
				.lean(); // ✅ don't rely on JWT for email
			const toEmail = adminUserDoc?.email || "";
			if (!toEmail)
				return res.status(400).json({ msg: "Admin email not set" });
			return res.json({ toEmail });
		}

		// Caller is a student: resolve their org, then the org owner's email
		if (
			!req.user.adminUser ||
			!mongoose.isValidObjectId(req.user.adminUser)
		) {
			return res
				.status(400)
				.json({ msg: "User is not linked to an admin org" });
		}

		const org = await AdminUser.findById(req.user.adminUser).lean();
		if (!org) return res.status(404).json({ msg: "Admin org not found" });

		// ownerUser holds the admin's User._id
		if (!org.ownerUser) {
			return res
				.status(400)
				.json({ msg: "Admin owner not set for this org" });
		}

		const owner = await User.findById(org.ownerUser).select("email").lean();
		const toEmail = owner?.email || "";
		if (!toEmail)
			return res.status(400).json({ msg: "Admin email not set" });

		return res.json({ toEmail });
	} catch (e) {
		console.error("GET /api/admin/contact-email", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
