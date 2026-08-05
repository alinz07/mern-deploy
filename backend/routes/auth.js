// server/routes/auth.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
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
	const {
		username,
		password,
		email,
		newAdmin,
		adminName,
		adminJoinCode,
		adminCode, // <— expect this from the client when creating an admin
	} = req.body;

	try {
		// basic presence checks
		if (!username || !password || !email) {
			return res
				.status(400)
				.json({ msg: "username, password, and email are required" });
		}

		// uniqueness checks
		if (await User.findOne({ username }))
			return res.status(400).json({ msg: "User already exists" });
		if (await User.findOne({ email }))
			return res.status(400).json({ msg: "Email already exists" });

		// CREATE ADMIN FLOW
		if (newAdmin) {
			// Server-side enforcement: verify admin creation code
			if (
				!adminCode ||
				String(adminCode).trim() !== config.adminCreateCode
			) {
				// Don’t reveal the expected code value; just say invalid.
				return res
					.status(403)
					.json({ msg: "Invalid admin creation code" });
			}
			if (!adminName)
				return res
					.status(400)
					.json({ msg: "adminName is required when newAdmin=true" });

			const joinCode = generateJoinCode();

			// Create admin user first
			let user = new User({ username, password, email, role: "admin" });
			const salt = await bcrypt.genSalt(10);
			user.password = await bcrypt.hash(password, salt);
			user = await user.save();

			// Create AdminUser org owned by this admin
			let adminUserDoc = await AdminUser.create({
				name: adminName,
				joinCode,
				ownerUser: user._id,
			});

			// Link admin to the org
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
					// Return the joinCode so admin can invite users
					res.status(201).json({
						token,
						joinCode: adminUserDoc.joinCode,
					});
				}
			);
			return;
		}

		// CHILD USER FLOW (must provide a valid adminJoinCode)
		if (!adminJoinCode)
			return res
				.status(400)
				.json({
					msg: "adminJoinCode is required for non-admin registration",
				});
		const adminUserDoc = await AdminUser.findOne({
			joinCode: adminJoinCode.trim(),
		});
		if (!adminUserDoc)
			return res.status(400).json({ msg: "Invalid admin join code" });

		let user = new User({
			username,
			password,
			email,
			role: "user",
			adminUser: adminUserDoc._id,
		});
		const salt = await bcrypt.genSalt(10);
		user.password = await bcrypt.hash(password, salt);
		user = await user.save();

		const payload = {
			user: {
				id: user.id,
				username: user.username,
				role: "user",
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
		if (err?.code === 11000) {
			const field = Object.keys(err.keyPattern || {})[0] || "field";
			return res
				.status(400)
				.json({ msg: `That ${field} is already in use` });
		}
		res.status(500).send("Server Error");
	}
});

// Login
router.post("/login", async (req, res) => {
	const { username, password } = req.body;
	try {
		if (mongoose.connection.readyState !== 1) {
			return res.status(503).json({
				msg: "Database is not connected. Restart the backend now that internet is available.",
				code: "DB_NOT_CONNECTED",
			});
		}
		if (!username || !password) {
			return res
				.status(400)
				.json({ msg: "Username and password are required" });
		}

		let user = await User.findOne({ username });
		if (!user)
			return res.status(401).json({
				msg: "No account found with that username.",
				code: "USER_NOT_FOUND",
			});

		const isMatch = await bcrypt.compare(password, user.password);
		if (!isMatch)
			return res.status(401).json({
				msg: "Password does not match that username.",
				code: "PASSWORD_MISMATCH",
			});

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
		console.error("Login error:", err);
		const dbErrorNames = [
			"MongoNetworkError",
			"MongoServerSelectionError",
			"MongooseServerSelectionError",
		];
		if (dbErrorNames.includes(err?.name)) {
			return res.status(503).json({
				msg: "Database connection failed. Check internet/VPN/MongoDB Atlas access, then restart the backend.",
				code: "DB_CONNECTION_FAILED",
			});
		}
		res.status(500).json({
			msg: "Login failed because of a server error.",
			code: "LOGIN_SERVER_ERROR",
		});
	}
});

module.exports = router;
