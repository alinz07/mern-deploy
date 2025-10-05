// routes/comments.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Comment = require("../models/Comment");
const Check = require("../models/Check");
const Day = require("../models/Day");
const Month = require("../models/Month");

async function loadContext(checkId) {
	const check = await Check.findById(checkId).lean();
	if (!check) return { error: { status: 404, msg: "Check not found" } };
	const day = await Day.findById(check.day).lean();
	const month = day ? await Month.findById(day.month).lean() : null;
	if (!day || !month)
		return { error: { status: 404, msg: "Related day/month missing" } };
	return { check, day, month };
}

function canAccess({ reqUser, check, month }) {
	const sameTenant = String(month.adminUser) === String(reqUser.adminUser);
	const isOwner = String(check.user) === String(reqUser.id);
	return sameTenant && (isOwner || reqUser.role === "admin");
}

// GET one comment for a check
router.get("/by-check/:checkId", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		if (!mongoose.isValidObjectId(checkId))
			return res.status(400).json({ msg: "Invalid id" });

		const ctx = await loadContext(checkId);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess({ reqUser: req.user, ...ctx }))
			return res.status(403).json({ msg: "Forbidden" });

		const doc = await Comment.findOne({ check: checkId });
		return res.json(doc || null);
	} catch (e) {
		return res.status(500).json({ msg: "Server error" });
	}
});

// PUT upsert comment for a check (create or update)
router.put("/by-check/:checkId", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		const { commentText } = req.body || {};
		if (!mongoose.isValidObjectId(checkId) || !commentText?.trim())
			return res.status(400).json({ msg: "commentText required" });

		const ctx = await loadContext(checkId);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess({ reqUser: req.user, ...ctx }))
			return res.status(403).json({ msg: "Forbidden" });

		const { check, day, month } = ctx;
		const doc = await Comment.findOneAndUpdate(
			{ check: check._id },
			{
				$set: {
					check: check._id,
					day: day._id,
					month: month._id,
					user: check.user,
					commentText: String(commentText),
				},
			},
			{ new: true, upsert: true }
		);

		return res.json(doc);
	} catch (e) {
		// Handle unique-constraint race gracefully
		if (
			e &&
			(e.code === 11000 || String(e.message || "").includes("E11000"))
		) {
			const existing = await Comment.findOne({
				check: req.params.checkId,
			});
			return res.json(existing);
		}
		return res.status(500).json({ msg: "Server error" });
	}
});

// DELETE the single comment for a check
router.delete("/by-check/:checkId", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		if (!mongoose.isValidObjectId(checkId))
			return res.status(400).json({ msg: "Invalid id" });

		const ctx = await loadContext(checkId);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess({ reqUser: req.user, ...ctx }))
			return res.status(403).json({ msg: "Forbidden" });

		const out = await Comment.deleteOne({ check: checkId });
		return res.json({ deleted: out.deletedCount > 0 });
	} catch (e) {
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
