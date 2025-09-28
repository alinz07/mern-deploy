// server/routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const { generateJoinCode } = require("../utils/joinCode");
const auth = require("../middleware/auth");

console.log("Auth routes loaded");

// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
	try {
		const user = await User.findById(req.user.id)
			.select("-password")
			.lean();
		if (!user) return res.status(404).json({ msg: "User not found" });
		res.json(user);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

// Register
router.post("/register", async (req, res) => {
	const { username, password, email, newAdmin, adminName, adminJoinCode } =
		req.body;

	try {
		// Uniqueness checks (username/email)
		if (await User.findOne({ username }))
			return res.status(400).json({ msg: "User already exists" });
		if (await User.findOne({ email }))
			return res.status(400).json({ msg: "Email already exists" });

		let role = "user";
		let adminUserDoc = null;

		if (newAdmin) {
			if (!adminName)
				return res
					.status(400)
					.json({ msg: "adminName is required when newAdmin=true" });
			const joinCode = generateJoinCode();

			// user placeholder to satisfy required ownerUser (we’ll create the user next)
			adminUserDoc = new AdminUser({
				name: adminName,
				joinCode,
				ownerUser: undefined,
			});
			// create the admin user account next
			let user = new User({ username, password, email, role: "admin" });
			const salt = await bcrypt.genSalt(10);
			user.password = await bcrypt.hash(password, salt);
			user = await user.save();

			adminUserDoc.ownerUser = user._id;
			adminUserDoc = await adminUserDoc.save();

			// update user to point at adminUser
			user.adminUser = adminUserDoc._id;
			await user.save();

			const payload = {
				user: {
					id: user.id,
					username: user.username,
					role: "admin",
					adminUser: adminUserDoc._id,
				},
			};
			jwt.sign(
				payload,
				config.jwtSecret,
				{ expiresIn: 3600 },
				(err, token) => {
					if (err) throw err;
					res.status(201).json({
						token,
						joinCode: adminUserDoc.joinCode,
					}); // return joinCode so admin can share it
				}
			);
			return;
		}
		// Register as a child user using adminJoinCode
		if (!adminJoinCode)
			return res.status(400).json({
				msg: "adminJoinCode is required for non-admin registration",
			});
		adminUserDoc = await AdminUser.findOne({ joinCode: adminJoinCode });
		if (!adminUserDoc)
			return res.status(400).json({ msg: "Invalid admin join code" });

		let user = new User({
			username,
			password,
			email,
			role,
			adminUser: adminUserDoc._id,
		});
		const salt = await bcrypt.genSalt(10);
		user.password = await bcrypt.hash(password, salt);
		user = await user.save();

		const payload = {
			user: {
				id: user.id,
				username: user.username,
				role,
				adminUser: adminUserDoc._id,
			},
		};
		jwt.sign(
			payload,
			config.jwtSecret,
			{ expiresIn: 3600 },
			(err, token) => {
				if (err) throw err;
				res.status(201).json({ token });
			}
		);
	} catch (err) {
		console.error("Register error:", err);
		res.status(500).send("Server Error");
	}
});

// Login
router.post("/login", async (req, res) => {
	const { username, password } = req.body;
	try {
		let user = await User.findOne({ username });
		if (!user) return res.status(400).json({ msg: "Invalid credentials" });

		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch)
			return res.status(400).json({ msg: "Invalid credentials" });

		const payload = {
			user: {
				id: user.id,
				username: user.username,
				role: user.role,
				adminUser: user.adminUser,
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
