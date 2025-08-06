const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Student = require("../models/Student");

router.get("/:id/data", auth, async (req, res) => {
	try {
		console.log("Incoming request for user data:", req.params.id);
		console.log("Authenticated user from token:", req.user);

		// Only allow users to see their own data or admin
		if (req.user.id !== req.params.id && req.user.username !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}

		const data = await UserData.find({ userId: req.params.id });
		res.json(data);
	} catch (err) {
		console.error("Route error:", err);
		res.status(500).send("Server Error");
	}
});
