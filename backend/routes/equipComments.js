const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const EquipComment = require("../models/EquipComment");
const EquipmentCheck = require("../models/EquipmentCheck");
const Day = require("../models/Day");
const Month = require("../models/Month");
const User = require("../models/User");

const VALID_FIELDS = ["left", "right", "both", "fmMic"];

async function loadContext(echeckId) {
	const echeck = await EquipmentCheck.findById(echeckId).lean();
	if (!echeck)
		return { error: { status: 404, msg: "EquipmentCheck not found" } };
	const [day, month, user] = await Promise.all([
		Day.findById(echeck.day).lean(),
		Month.findById(echeck.month).lean(),
		User.findById(echeck.user).lean(),
	]);
	if (!day || !month || !user)
		return { error: { status: 404, msg: "Related docs missing" } };
	return { echeck, day, month, user };
}

function canAccess(reqUser, ctx) {
	// equipment checks are admin-only by design
	return (
		reqUser.role === "admin" &&
		String(ctx.month.adminUser) === String(reqUser.adminUser) &&
		String(ctx.user.adminUser) === String(reqUser.adminUser)
	);
}

// GET all fields' equipComments for an equipmentCheck
router.get("/by-echeck/:id/all", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });
		const ctx = await loadContext(id);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess(req.user, ctx))
			return res.status(403).json({ msg: "Forbidden" });

		const list = await EquipComment.find({ equipmentCheck: id }).lean();
		const map = Object.fromEntries(VALID_FIELDS.map((f) => [f, null]));
		for (const c of list)
			if (VALID_FIELDS.includes(c.field)) map[c.field] = c;
		res.json(map);
	} catch {
		res.status(500).json({ msg: "Server error" });
	}
});

// UPSERT one field
router.put("/by-echeck/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		const { field, commentText } = req.body || {};
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });
		if (!VALID_FIELDS.includes(field))
			return res.status(400).json({ msg: "Invalid field" });
		if (!commentText?.trim())
			return res.status(400).json({ msg: "commentText required" });

		const ctx = await loadContext(id);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess(req.user, ctx))
			return res.status(403).json({ msg: "Forbidden" });

		const { echeck, day, month, user } = ctx;
		const doc = await EquipComment.findOneAndUpdate(
			{ equipmentCheck: echeck._id, field },
			{
				$set: {
					equipmentCheck: echeck._id,
					day: day._id,
					month: month._id,
					user: user._id,
					field,
					commentText: String(commentText),
				},
			},
			{ new: true, upsert: true }
		);
		return res.json(doc);
	} catch (e) {
		if (
			e &&
			(e.code === 11000 || String(e.message || "").includes("E11000"))
		) {
			const existing = await EquipComment.findOne({
				equipmentCheck: req.params.id,
				field: req.body.field,
			});
			return res.json(existing);
		}
		return res.status(500).json({ msg: "Server error" });
	}
});

// DELETE one field
router.delete("/by-echeck/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		const { field } = req.query || {};
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });
		if (!VALID_FIELDS.includes(field))
			return res.status(400).json({ msg: "Invalid field" });

		const ctx = await loadContext(id);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess(req.user, ctx))
			return res.status(403).json({ msg: "Forbidden" });

		const out = await EquipComment.deleteOne({ equipmentCheck: id, field });
		return res.json({ deleted: out.deletedCount > 0 });
	} catch {
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
