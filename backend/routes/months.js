const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const mongoose = require("mongoose");
const Month = require("../models/Month");
const User = require("../models/User");

// GET all months (admin sees all, users see their own)
router.get("/", auth, async (req, res) => {
	try {
		const filter =
			req.user.role === "admin"
				? { adminUser: req.user.adminUser }
				: { userId: req.user.id };

		const months = await Month.find(filter)
			.sort({ name: 1 })
			.populate("userId", "username");
		res.json(months);
	} catch (err) {
		console.error("GET /months error:", err?.message || err);
		res.status(500).send("Server Error");
	}
});

// POST /api/months/new  (idempotent, no day seeding)
// - users: creates for self
// - admins: can create for a student in their tenant by sending { userId }
router.post("/new", auth, async (req, res) => {
	try {
		const { name, userId: bodyUserId } = req.body || {};
		if (!name)
			return res.status(400).json({ msg: "Month name is required" });

		const adminUserId = req.user?.adminUser;
		if (!adminUserId || !mongoose.isValidObjectId(adminUserId)) {
			return res
				.status(401)
				.json({ msg: "Invalid or missing tenant context" });
		}

		let targetUserId = req.user?.id;

		// Admins may target a specific student
		if (req.user?.role === "admin" && bodyUserId) {
			if (!mongoose.isValidObjectId(bodyUserId)) {
				return res.status(400).json({ msg: "Invalid target userId" });
			}

			const target = await User.findById(bodyUserId)
				.select("role adminUser")
				.lean();

			if (!target) return res.status(404).json({ msg: "User not found" });
			if (target.role !== "user") {
				return res
					.status(400)
					.json({ msg: "Months can only be created for students" });
			}
			if (String(target.adminUser) !== String(adminUserId)) {
				return res.status(403).json({ msg: "Access denied (tenant)" });
			}

			targetUserId = bodyUserId;
		}

		// Non-admin: must have a valid self id
		if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) {
			return res
				.status(401)
				.json({ msg: "Invalid or missing user context" });
		}

		let month = await Month.findOne({ name, userId: targetUserId });
		const isNew = !month;

		if (!month) {
			month = await Month.create({
				name,
				userId: targetUserId,
				adminUser: adminUserId,
			});
		}

		return res.status(isNew ? 201 : 200).json(month);
	} catch (e) {
		console.error("POST /months/new failed:", e?.message || e);
		return res
			.status(500)
			.json({ msg: "Server error", error: e?.message || String(e) });
	}
});

// GET a single month by id (owner or admin only)
router.get("/:id", auth, async (req, res) => {
	try {
		const m = await Month.findById(req.params.id);
		if (!m) return res.status(404).json({ msg: "Not found" });

		const sameTenant = String(m.adminUser) === String(req.user.adminUser);
		const isOwner = String(m.userId) === req.user.id;

		if (!(sameTenant && (req.user.role === "admin" || isOwner))) {
			return res.status(403).json({ msg: "Forbidden" });
		}
		res.json(m);
	} catch (e) {
		console.error("GET /months/:id failed:", e?.message || e);
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
