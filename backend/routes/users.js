console.log("✅ users.js loaded");

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User"); // ✅ Get user info, not students

// GET /api/users/:id/data
router.get("/:id/data", auth, async (req, res) => {
	try {
		console.log("Incoming request for user data:", req.params.id);
		console.log("Authenticated user from token:", req.user);

		// Only allow users to see their own info or admin
		if (req.user.id !== req.params.id && req.user.username !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}

		// Fetch the user's info (excluding password)
		const user = await User.findById(req.params.id).select("-password");

		if (!user) {
			return res.status(404).json({ msg: "User not found" });
		}

		res.json(user);
	} catch (err) {
		console.error("Route error:", err);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
