const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Comment = require("../models/Comment");
const Check = require("../models/Check");
const Day = require("../models/Day");
const Month = require("../models/Month");

// Create a comment (owner or admin same-tenant)
router.post("/", auth, async (req, res) => {
	try {
		const { checkId, commentText } = req.body || {};
		if (!mongoose.isValidObjectId(checkId) || !commentText)
			return res
				.status(400)
				.json({ msg: "checkId and commentText required" });

		const check = await Check.findById(checkId).lean();
		if (!check) return res.status(404).json({ msg: "Check not found" });

		const day = await Day.findById(check.day).lean();
		const month = day ? await Month.findById(day.month).lean() : null;
		if (!day || !month)
			return res.status(404).json({ msg: "Related day/month missing" });

		const sameTenant =
			String(month.adminUser) === String(req.user.adminUser);
		const isOwner = String(check.user) === String(req.user.id);
		if (!(sameTenant && (isOwner || req.user.role === "admin")))
			return res.status(403).json({ msg: "Forbidden" });

		const doc = await Comment.create({
			check: check._id,
			day: day._id,
			month: month._id,
			user: check.user,
			commentText: String(commentText),
		});
		res.status(201).json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

// List comments for a check (owner or admin)
router.get("/by-check/:checkId", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		if (!mongoose.isValidObjectId(checkId))
			return res.status(400).json({ msg: "Invalid id" });
		const check = await Check.findById(checkId).lean();
		if (!check) return res.status(404).json({ msg: "Check not found" });

		const day = await Day.findById(check.day).lean();
		const month = await Month.findById(day.month).lean();

		const sameTenant =
			String(month.adminUser) === String(req.user.adminUser);
		const isOwner = String(check.user) === String(req.user.id);
		if (!(sameTenant && (isOwner || req.user.role === "admin")))
			return res.status(403).json({ msg: "Forbidden" });

		res.json(
			await Comment.find({ check: checkId }).sort({ createdAt: -1 })
		);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
