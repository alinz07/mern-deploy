// server/routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const User = require("../models/Student");

console.log("Auth routes loaded");

// Register Route
router.post("/register", async (req, res) => {
	console.log("Register endpoint hit with:", req.body);

	const { username, password } = req.body;

	try {
		let user = await User.findOne({ username });
		if (user) {
			console.log("User already exists:", user.username);
			return res.status(400).json({ msg: "User already exists" });
		}

		user = new User({ username: username, password: password });

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
			user: { id: user.id },
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

// Get All Students
router.get("/students", async (req, res) => {
	try {
		const students = await Student.find();

		res.json(students);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
