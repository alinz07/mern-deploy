// routes/comments.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Comment = require("../models/Comment");
const Check = require("../models/Check");
const Day = require("../models/Day");
const Month = require("../models/Month");

const VALID_FIELDS = [
	"checkone",
	"checktwo",
	"checkthree",
	"checkfour",
	"checkfive",
	"checksix",
	"checkseven",
	"checkeight",
	"checknine",
	"checkten",
];

// ===== Helpers to match stats.js Pacific-time month labeling =====
const APP_TZ = "America/Los_Angeles";
const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

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

function tzParts(date = new Date(), tz = APP_TZ) {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		year: "numeric",
		month: "numeric",
		day: "numeric",
	});
	const parts = fmt.formatToParts(date);
	const y = +parts.find((p) => p.type === "year").value;
	const m = +parts.find((p) => p.type === "month").value;
	const d = +parts.find((p) => p.type === "day").value;
	return { y, m, d };
}
function monthLabelFromParts({ y, m }) {
	return `${MONTH_NAMES[m - 1]} ${y}`;
}
function shiftMonth({ y, m, d }, delta) {
	const nm = m + delta;
	const y2 = y + Math.floor((nm - 1) / 12);
	let m2 = (nm - 1) % 12;
	if (m2 < 0) m2 += 12;
	m2 += 1;
	return { y: y2, m: m2, d };
}
// BULK: get all fields’ comments for a check
router.get("/by-check/:checkId/all", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		if (!mongoose.isValidObjectId(checkId))
			return res.status(400).json({ msg: "Invalid id" });

		const ctx = await loadContext(checkId);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess({ reqUser: req.user, ...ctx }))
			return res.status(403).json({ msg: "Forbidden" });

		const list = await Comment.find({ check: checkId }).lean();
		const map = Object.fromEntries(VALID_FIELDS.map((f) => [f, null]));
		for (const c of list)
			if (VALID_FIELDS.includes(c.field)) map[c.field] = c;
		return res.json(map);
	} catch {
		return res.status(500).json({ msg: "Server error" });
	}
});

// GET /api/comments/by-user/:userId/by-field?scope=current|previous|both
// Returns { field: [{ dayNumber, commentText }], ... } for PT "to-date" when scope=current
router.get("/by-user/:userId/by-field", auth, async (req, res) => {
	try {
		const { userId } = req.params;
		const scope = (req.query.scope || "current").toLowerCase(); // current|previous|both
		if (!mongoose.isValidObjectId(userId))
			return res.status(400).json({ msg: "Invalid userId" });

		// permission: self or admin in same tenant
		if (req.user.role !== "admin" && req.user.id !== userId) {
			return res.status(403).json({ msg: "Access denied" });
		}

		const nowTZ = tzParts(new Date(), APP_TZ);
		const prevTZ = shiftMonth(nowTZ, -1);
		const currentName = monthLabelFromParts(nowTZ);
		const previousName = monthLabelFromParts(prevTZ);
		const daysElapsed = nowTZ.d;

		const wantCurrent = scope === "current" || scope === "both";
		const wantPrevious = scope === "previous" || scope === "both";

		// Start from Day (user scope), join Month → name, filter by month(s) & to-date for current
		const monthMatch = [];
		if (wantPrevious) monthMatch.push({ "month.name": previousName });
		if (wantCurrent) monthMatch.push({ "month.name": currentName });

		if (monthMatch.length === 0) {
			return res.json({}); // nothing requested
		}

		const pipeline = [
			{ $match: { userId: new mongoose.Types.ObjectId(userId) } },
			{
				$lookup: {
					from: "months",
					localField: "month",
					foreignField: "_id",
					as: "month",
				},
			},
			{
				$match: {
					"month.adminUser": new mongoose.Types.ObjectId(
						req.user.adminUser
					),
				},
			},
			{
				$match: {
					$or: [
						...(wantPrevious
							? [{ "month.name": previousName }]
							: []),
						...(wantCurrent
							? [
									{
										$and: [
											{ "month.name": currentName },
											{
												dayNumber: {
													$lte: daysElapsed,
												},
											},
										],
									},
							  ]
							: []),
					],
				},
			},
			// For these days, look up the specific user's Check to know which check doc to filter comments by
			{
				$lookup: {
					from: "checks",
					let: { dayId: "$_id" },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ["$day", "$$dayId"] },
										{
											$eq: [
												"$user",
												new mongoose.Types.ObjectId(
													userId
												),
											],
										},
									],
								},
							},
						},
						{ $project: { _id: 1 } },
					],
					as: "check",
				},
			},
			{ $unwind: { path: "$check", preserveNullAndEmptyArrays: false } },

			// Join all comments tied to that check
			{
				$lookup: {
					from: "comments",
					localField: "check._id",
					foreignField: "check",
					as: "comments",
				},
			},
			{
				$unwind: {
					path: "$comments",
					preserveNullAndEmptyArrays: false,
				},
			},

			// Keep only valid fields
			{
				$match: {
					"comments.field": {
						$in: [
							"checkone",
							"checktwo",
							"checkthree",
							"checkfour",
							"checkfive",
							"checksix",
							"checkseven",
							"checkeight",
							"checknine",
							"checkten",
						],
					},
				},
			},

			// Project minimal data we need
			// Project minimal data we need (+ dayId, monthId)
			{
				$project: {
					field: "$comments.field",
					commentText: "$comments.commentText",
					dayNumber: "$dayNumber",
					dayId: "$_id",
					monthId: "$month._id",
				},
			},

			// Group by field, collect comments (now with dayId/monthId)
			{
				$group: {
					_id: "$field",
					items: {
						$push: {
							dayNumber: "$dayNumber",
							commentText: "$commentText",
							dayId: "$dayId",
							monthId: "$monthId",
						},
					},
				},
			},
		];

		const grouped = await (
			await mongoose.connection.collection("days").aggregate(pipeline)
		).toArray();

		// shape into { field: [ ... ] }
		const out = Object.fromEntries(
			[
				"checkone",
				"checktwo",
				"checkthree",
				"checkfour",
				"checkfive",
				"checksix",
				"checkseven",
				"checkeight",
				"checknine",
				"checkten",
			].map((f) => [f, []])
		);
		for (const g of grouped) out[g._id] = g.items || [];

		return res.json(out);
	} catch (e) {
		console.error("GET /api/comments/by-user/:userId/by-field error:", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// UPSERT one field’s comment
router.put("/by-check/:checkId", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		const { field, commentText } = req.body || {};
		if (!mongoose.isValidObjectId(checkId))
			return res.status(400).json({ msg: "Invalid id" });
		if (!VALID_FIELDS.includes(field))
			return res.status(400).json({ msg: "Invalid field" });
		if (!commentText?.trim())
			return res.status(400).json({ msg: "commentText required" });

		const ctx = await loadContext(checkId);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess({ reqUser: req.user, ...ctx }))
			return res.status(403).json({ msg: "Forbidden" });

		const { check, day, month } = ctx;
		const doc = await Comment.findOneAndUpdate(
			{ check: check._id, field },
			{
				$set: {
					check: check._id,
					day: day._id,
					month: month._id,
					user: check.user,
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
			const existing = await Comment.findOne({
				check: req.params.checkId,
				field: req.body.field,
			});
			return res.json(existing);
		}
		return res.status(500).json({ msg: "Server error" });
	}
});

// DELETE one field’s comment
router.delete("/by-check/:checkId", auth, async (req, res) => {
	try {
		const { checkId } = req.params;
		const { field } = req.query;
		if (!mongoose.isValidObjectId(checkId))
			return res.status(400).json({ msg: "Invalid id" });
		if (!VALID_FIELDS.includes(field))
			return res.status(400).json({ msg: "Invalid field" });

		const ctx = await loadContext(checkId);
		if (ctx.error)
			return res.status(ctx.error.status).json({ msg: ctx.error.msg });
		if (!canAccess({ reqUser: req.user, ...ctx }))
			return res.status(403).json({ msg: "Forbidden" });

		const out = await Comment.deleteOne({ check: checkId, field });
		return res.json({ deleted: out.deletedCount > 0 });
	} catch {
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
