// server/routes/users.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const mongoose = require("mongoose");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check");

// GET /api/users  (admin: only within same tenant)
router.get("/", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Access denied" });
		const users = await User.find({ adminUser: req.user.adminUser }).select(
			"-password"
		);
		res.json(users);
	} catch (err) {
		console.error("Error fetching users:", err.message);
		res.status(500).send("Server Error");
	}
});

// GET /api/users/:id/data  (self or admin in same tenant)
router.get("/:id/data", auth, async (req, res) => {
	try {
		if (req.user.id !== req.params.id && req.user.role !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}
		const user = await User.findById(req.params.id).select("-password");
		if (!user) return res.status(404).json({ msg: "User not found" });
		if (
			req.user.role === "admin" &&
			String(user.adminUser) !== String(req.user.adminUser)
		) {
			return res.status(403).json({ msg: "Access denied" });
		}
		res.json(user);
	} catch (err) {
		console.error("Route error:", err.message);
		res.status(500).send("Server Error");
	}
});

// DELETE /api/users/:id  (admin: only own tenant; not self)
router.delete("/:id", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Access denied" });

		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid user id" });
		if (id === req.user.id)
			return res
				.status(400)
				.json({ msg: "Refusing to delete the active admin" });

		const victim = await User.findById(id).lean();
		if (!victim) return res.status(404).json({ msg: "User not found" });
		if (String(victim.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Access denied (tenant)" });
		}

		// Remove this user's months -> days -> checks
		const months = await Month.find({ userId: id }).select("_id").lean();
		const monthIds = months.map((m) => m._id);
		await Promise.all([
			Day.deleteMany({ month: { $in: monthIds } }),
			Month.deleteMany({ userId: id }),
			Check.deleteMany({ user: id }),
			User.findByIdAndDelete(id),
		]);

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

// PUT /api/users/:id  (admin: only own tenant)
router.put("/:id", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Access denied" });

		const { id } = req.params;
		let { username, email } = req.body || {};
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid user id" });

		const victim = await User.findById(id).lean();
		if (!victim) return res.status(404).json({ msg: "User not found" });
		if (String(victim.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Access denied (tenant)" });
		}

		if (typeof username === "string") username = username.trim();
		if (typeof email === "string") email = email.trim().toLowerCase();

		const update = {};
		if (typeof username === "string") {
			if (username.length < 3)
				return res
					.status(400)
					.json({ msg: "Username must be at least 3 characters" });
			if (username.length > 50)
				return res
					.status(400)
					.json({ msg: "Username must be at most 50 characters" });
			update.username = username;
		}
		if (typeof email === "string" && email !== "") {
			const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
			if (!ok)
				return res.status(400).json({ msg: "Invalid email address" });
			update.email = email;
		} else if (email === "") {
			update.email = undefined;
		}

		if (!Object.keys(update).length)
			return res.status(400).json({ msg: "No fields to update" });

		const updated = await User.findByIdAndUpdate(id, update, {
			new: true,
			runValidators: true,
			context: "query",
			select: "-password",
		});

		if (!updated) return res.status(404).json({ msg: "User not found" });
		return res.json(updated);
	} catch (err) {
		if (err?.code === 11000) {
			const field = Object.keys(err.keyPattern || {})[0] || "field";
			return res
				.status(400)
				.json({ msg: `That ${field} is already in use` });
		}
		console.error("PUT /api/users/:id error:", err);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
