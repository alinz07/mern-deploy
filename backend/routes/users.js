// server/routes/users.js
console.log("✅ users.js loaded");

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const mongoose = require("mongoose");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check");

// GET /api/users  (admin only)
router.get("/", auth, async (req, res) => {
	try {
		console.log("GET /api/users hit by:", req.user.username);
		if (req.user.username !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}
		const users = await User.find().select("-password");
		res.json(users);
	} catch (err) {
		console.error("Error fetching users:", err.message);
		res.status(500).send("Server Error");
	}
});

// GET /api/users/:id/data  (self or admin)
router.get("/:id/data", auth, async (req, res) => {
	try {
		console.log("Incoming request for user data:", req.params.id);

		if (req.user.id !== req.params.id && req.user.username !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}

		const user = await User.findById(req.params.id).select("-password");
		if (!user) return res.status(404).json({ msg: "User not found" });

		res.json(user);
	} catch (err) {
		console.error("Route error:", err.message);
		res.status(500).send("Server Error");
	}
});

// DELETE /api/users/:id  (admin only)
router.delete("/:id", auth, async (req, res) => {
	try {
		if (req.user.username !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ msg: "Invalid user id" });
		}
		if (id === req.user.id) {
			return res
				.status(400)
				.json({ msg: "Refusing to delete the active admin" });
		}

		// Gather this user's months so we can remove dependent docs.
		const months = await Month.find({ userId: id }).select("_id").lean();
		const monthIds = months.map((m) => m._id);

		// Best-effort cleanup: days under those months, the months, and that user's checks.
		const deletions = [
			Day.deleteMany({ month: { $in: monthIds } }),
			Month.deleteMany({ userId: id }),
			Check.deleteMany({ user: id }),
			User.findByIdAndDelete(id),
		];
		await Promise.all(deletions);

		return res.json({
			ok: true,
			userId: id,
			removed: { months: monthIds.length },
		});
	} catch (err) {
		console.error("DELETE /api/users/:id error:", err);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
