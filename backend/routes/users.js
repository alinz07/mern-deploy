// server/routes/users.js
console.log("✅ users.js loaded");

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");

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

module.exports = router;
