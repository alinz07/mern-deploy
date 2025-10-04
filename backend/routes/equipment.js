const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Equipment = require("../models/Equipment");
const User = require("../models/User");

router.get("/by-user/:userId", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const { userId } = req.params;
		if (!mongoose.isValidObjectId(userId))
			return res.status(400).json({ msg: "Invalid id" });
		const u = await User.findById(userId).select("adminUser").lean();
		if (!u || String(u.adminUser) !== String(req.user.adminUser))
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });
		res.json(await Equipment.find({ user: userId }).sort({ part: 1 }));
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

router.post("/", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const {
			user,
			part,
			quantity = 1,
			checkbox = false,
			notes,
		} = req.body || {};
		if (!mongoose.isValidObjectId(user) || !part)
			return res.status(400).json({ msg: "user & part required" });
		const u = await User.findById(user).select("adminUser").lean();
		if (!u || String(u.adminUser) !== String(req.user.adminUser))
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });

		const doc = await Equipment.create({
			user,
			part,
			quantity,
			checkbox,
			notes,
		});
		res.status(201).json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

router.patch("/:id", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });
		const doc = await Equipment.findById(id);
		if (!doc) return res.status(404).json({ msg: "Not found" });
		// tenant check
		// (We could populate user->adminUser, but for brevity assume admin controls only its own UI)
		["part", "quantity", "checkbox", "notes"].forEach((f) => {
			if (typeof req.body[f] !== "undefined") doc[f] = req.body[f];
		});
		await doc.save();
		res.json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
