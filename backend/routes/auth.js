// server/routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const auth = require("../middleware/auth");

console.log("Auth routes loaded");

router.get("/me", auth, async (req, res) => {
	try {
		const user = await User.findById(req.user.id).select("-password");
		if (!user) return res.status(404).json({ msg: "User not found" });

		res.json(user);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

// Register Route
router.post("/register", async (req, res) => {
	console.log("Register endpoint hit with:", req.body);

	const { username, password, email } = req.body;

	try {
		// Check if username exists
		let user = await User.findOne({ username });
		if (user) {
			console.log("User already exists:", user.username);
			return res.status(400).json({ msg: "User already exists" });
		}
		// Check if email exists
		let existingEmail = await User.findOne({ email });
		if (existingEmail) {
			return res.status(400).json({ msg: "Email already exists" });
		}

		user = new User({
			username: username,
			password: password,
			email: email,
		});

		const salt = await bcrypt.genSalt(10);
		user.password = await bcrypt.hash(password, salt);

		try {
			await user.save();
			console.log("User saved successfully");
		} catch (saveErr) {
			console.error("Save error:", saveErr.message);
			return res
				.status(500)
				.json({ msg: "Error saving user", error: saveErr.message });
		}

		const payload = {
			user: { id: user.id, username: user.username },
		};

		jwt.sign(
			payload,
			config.jwtSecret,
			{ expiresIn: 3600 },
			(err, token) => {
				if (err) throw err;
				res.json({ token });
			}
		);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

router.post("/login", async (req, res) => {
	const { username, password } = req.body;

	try {
		// Check if the user exists
		let user = await User.findOne({ username });
		if (!user) {
			return res.status(400).json({ msg: "Invalid credentials" });
		}

		// Validate password
		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch) {
			return res.status(400).json({ msg: "Invalid credentials" });
		}

		// Generate JWT token
		const payload = {
			user: {
				id: user.id,
				username: user.username,
			},
		};
		jwt.sign(
			payload,
			config.jwtSecret,
			{ expiresIn: 3600 },
			(err, token) => {
				if (err) throw err;
				res.json({ token });
			}
		);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
