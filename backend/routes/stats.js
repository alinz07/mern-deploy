// backend/routes/stats.js  (DROP-IN, no luxon)
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check");
const EquipmentCheck = require("../models/EquipmentCheck");
const auth = require("../middleware/auth");

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
function lastDayOfMonthTZ({ y, m }, tz = APP_TZ) {
	const nextMonth = shiftMonth({ y, m, d: 1 }, +1);
	const asDate = new Date(
		`${MONTH_NAMES[nextMonth.m - 1]} 1, ${nextMonth.y} 00:00:00 GMT`
	);
	const prev = new Date(asDate.getTime() - 24 * 60 * 60 * 1000);
	const { d } = tzParts(prev, tz);
	return d;
}

/* ---------------- EXISTING STATS (unchanged) ---------------- */
// /api/stats/admin-checks
router.get("/admin-checks", auth, async (req, res) => {
	const t0 = Date.now();
	try {
		const adminId = req.user?.id;
		if (!adminId || !mongoose.isValidObjectId(adminId)) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const AdminOrg = await AdminUser.findOne({ ownerUser: adminId }).lean();
		const nowTZ = tzParts(new Date(), APP_TZ);
		const prevTZ = shiftMonth(nowTZ, -1);
		const currLabel = monthLabelFromParts(nowTZ);
		const prevLabel = monthLabelFromParts(prevTZ);
		const daysElapsedThisMonth = nowTZ.d;
		const daysInPrevMonth = lastDayOfMonthTZ(prevTZ, APP_TZ);

		if (!AdminOrg) {
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		const childUsers = await User.find({
			adminUser: AdminOrg._id,
			role: { $ne: "admin" },
		})
			.select({ _id: 1, username: 1 })
			.lean();

		if (childUsers.length === 0) {
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		const userIds = childUsers.map((u) => u._id);
		const rowsMap = new Map(
			childUsers.map((u) => [
				String(u._id),
				{
					userId: String(u._id),
					username: u.username || "(unknown)",
					currOnlineDen: 0,
					currOnlineSuc: 0,
					currInpersonDen: 0,
					currInpersonSuc: 0,
					prevOnlineDen: 0,
					prevOnlineSuc: 0,
					prevInpersonDen: 0,
					prevInpersonSuc: 0,
					hasCurrMonth: false,
					hasPrevMonth: false,
				},
			])
		);

		const [monthsCurr, monthsPrev] = await Promise.all([
			Month.find({ name: currLabel, userId: { $in: userIds } })
				.select({ _id: 1, userId: 1 })
				.lean(),
			Month.find({ name: prevLabel, userId: { $in: userIds } })
				.select({ _id: 1, userId: 1 })
				.lean(),
		]);
		const currByUser = new Map(
			monthsCurr.map((m) => [String(m.userId), String(m._id)])
		);
		const prevByUser = new Map(
			monthsPrev.map((m) => [String(m.userId), String(m._id)])
		);

		for (const u of childUsers) {
			const uid = String(u._id);
			const r = rowsMap.get(uid);
			r.hasCurrMonth = currByUser.has(uid);
			r.hasPrevMonth = prevByUser.has(uid);
		}

		const monthIdsToLoad = [
			...monthsCurr.map((m) => m._id),
			...monthsPrev.map((m) => m._id),
		];
		const dayDocs = await Day.find({ month: { $in: monthIdsToLoad } })
			.select({
				_id: 1,
				month: 1,
				dayNumber: 1,
				userId: 1,
				environment: 1,
			})
			.lean();

		const dayById = new Map(dayDocs.map((d) => [String(d._id), d]));
		for (const d of dayDocs) {
			const uid = String(d.userId);
			const r = rowsMap.get(uid);
			if (!r) continue;
			const env = d.environment === "inperson" ? "inperson" : "online";
			const currMonthId = currByUser.get(uid);
			const prevMonthId = prevByUser.get(uid);

			if (currMonthId && String(d.month) === currMonthId) {
				if (typeof d.dayNumber === "number" && d.dayNumber <= nowTZ.d) {
					if (env === "online") r.currOnlineDen += 1;
					else r.currInpersonDen += 1;
				}
			} else if (prevMonthId && String(d.month) === prevMonthId) {
				if (env === "online") r.prevOnlineDen += 1;
				else r.prevInpersonDen += 1;
			}
		}

		const successfulChecks = await Check.find({
			day: { $in: dayDocs.map((d) => d._id) },
			checkone: true,
			checktwo: true,
			checkthree: true,
			checkfour: true,
			checkfive: true,
			checksix: true,
			checkseven: true,
			checkeight: true,
			checknine: true,
			checkten: true,
		})
			.select({ _id: 0, day: 1 })
			.lean();

		for (const c of successfulChecks) {
			const d = dayById.get(String(c.day));
			if (!d) continue;
			const uid = String(d.userId);
			const r = rowsMap.get(uid);
			if (!r) continue;
			const env = d.environment === "inperson" ? "inperson" : "online";
			const currMonthId = currByUser.get(uid);
			const prevMonthId = prevByUser.get(uid);

			if (currMonthId && String(d.month) === currMonthId) {
				if (typeof d.dayNumber === "number" && d.dayNumber <= nowTZ.d) {
					if (env === "online") r.currOnlineSuc += 1;
					else r.currInpersonSuc += 1;
				}
			} else if (prevMonthId && String(d.month) === prevMonthId) {
				if (env === "online") r.prevOnlineSuc += 1;
				else r.prevInpersonSuc += 1;
			}
		}

		const pct = (s, den) => (den > 0 ? Math.round((s / den) * 100) : 0);

		const rows = Array.from(rowsMap.values())
			.map((r) => ({
				userId: r.userId,
				username: r.username,
				currOnlinePercent: r.hasCurrMonth
					? pct(r.currOnlineSuc, r.currOnlineDen)
					: 0,
				currInpersonPercent: r.hasCurrMonth
					? pct(r.currInpersonSuc, r.currInpersonDen)
					: 0,
				prevOnlinePercent: r.hasPrevMonth
					? pct(r.prevOnlineSuc, r.prevOnlineDen)
					: 0,
				prevInpersonPercent: r.hasPrevMonth
					? pct(r.prevInpersonSuc, r.prevInpersonDen)
					: 0,
				currOnlineSuc: r.currOnlineSuc,
				currOnlineDen: r.currOnlineDen,
				currInpersonSuc: r.currInpersonSuc,
				currInpersonDen: r.currInpersonDen,
				prevOnlineSuc: r.prevOnlineSuc,
				prevOnlineDen: r.prevOnlineDen,
				prevInpersonSuc: r.prevInpersonSuc,
				prevInpersonDen: r.prevInpersonDen,
			}))
			.sort((a, b) => a.username.localeCompare(b.username));

		return res.json({
			rows,
			currentMonthLabel: currLabel,
			previousMonthLabel: prevLabel,
		});
	} catch (err) {
		console.error("[STATS][ERROR]", err);
		return res.status(500).json({ error: "Failed to compute stats" });
	} finally {
		console.log("[STATS] done in ms:", Date.now() - t0);
	}
});

/* ---------------- Equipment completion stats (unchanged) ---------------- */
router.get("/admin-equip", auth, async (req, res) => {
	const t0 = Date.now();
	try {
		const adminId = req.user?.id;
		if (!adminId || !mongoose.isValidObjectId(adminId)) {
			return res.status(401).json({ error: "Unauthorized" });
		}
		const AdminOrg = await AdminUser.findOne({ ownerUser: adminId }).lean();

		const nowTZ = tzParts(new Date(), APP_TZ);
		const prevTZ = shiftMonth(nowTZ, -1);
		const currLabel = monthLabelFromParts(nowTZ);
		const prevLabel = monthLabelFromParts(prevTZ);

		if (!AdminOrg) {
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		const childUsers = await User.find({
			adminUser: AdminOrg._id,
			role: { $ne: "admin" },
		})
			.select({ _id: 1, username: 1 })
			.lean();
		if (childUsers.length === 0) {
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}
		const userIds = childUsers.map((u) => u._id);

		const [monthsCurr, monthsPrev] = await Promise.all([
			Month.find({ name: currLabel, userId: { $in: userIds } })
				.select({ _id: 1, userId: 1 })
				.lean(),
			Month.find({ name: prevLabel, userId: { $in: userIds } })
				.select({ _id: 1, userId: 1 })
				.lean(),
		]);
		const currByUser = new Map(
			monthsCurr.map((m) => [String(m.userId), String(m._id)])
		);
		const prevByUser = new Map(
			monthsPrev.map((m) => [String(m.userId), String(m._id)])
		);

		const rowsMap = new Map(
			childUsers.map((u) => [
				String(u._id),
				{
					userId: String(u._id),
					username: u.username || "(unknown)",
					hasCurrMonth: currByUser.has(String(u._id)),
					hasPrevMonth: prevByUser.has(String(u._id)),
					currEquipDen: 0,
					currEquipSuc: 0,
					prevEquipDen: 0,
					prevEquipSuc: 0,
				},
			])
		);

		const allMonthIds = [
			...monthsCurr.map((m) => String(m._id)),
			...monthsPrev.map((m) => String(m._id)),
		];
		if (allMonthIds.length === 0) {
			return res.json({
				rows: Array.from(rowsMap.values()).sort((a, b) =>
					a.username.localeCompare(b.username)
				),
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		const echecks = await EquipmentCheck.find({
			user: { $in: userIds },
			month: { $in: allMonthIds },
		})
			.select({
				_id: 1,
				user: 1,
				month: 1,
				day: 1,
				left: 1,
				right: 1,
				both: 1,
				fmMic: 1,
			})
			.lean();

		const dayIds = echecks.map((ec) => ec.day);
		const dayDocs = await Day.find({ _id: { $in: dayIds } })
			.select({ _id: 1, dayNumber: 1 })
			.lean();
		const dayNumById = new Map(
			dayDocs.map((d) => [String(d._id), d.dayNumber || 0])
		);

		for (const ec of echecks) {
			const uid = String(ec.user);
			const r = rowsMap.get(uid);
			if (!r) continue;

			const ecMonthId = String(ec.month);
			const isCurr =
				currByUser.get(uid) && ecMonthId === currByUser.get(uid);
			const isPrev =
				prevByUser.get(uid) && ecMonthId === prevByUser.get(uid);
			if (!isCurr && !isPrev) continue;

			const success = !!(ec.left && ec.right && ec.both && ec.fmMic);

			if (isCurr) {
				const dn = dayNumById.get(String(ec.day)) || 0;
				if (dn > 0 && dn <= nowTZ.d) {
					r.currEquipDen += 1;
					if (success) r.currEquipSuc += 1;
				}
			} else if (isPrev) {
				r.prevEquipDen += 1;
				if (success) r.prevEquipSuc += 1;
			}
		}

		const pct = (s, den) => (den > 0 ? Math.round((s / den) * 100) : 0);

		const rows = Array.from(rowsMap.values())
			.map((r) => ({
				userId: r.userId,
				username: r.username,
				currEquipPercent: r.hasCurrMonth
					? pct(r.currEquipSuc, r.currEquipDen)
					: 0,
				prevEquipPercent: r.hasPrevMonth
					? pct(r.prevEquipSuc, r.prevEquipDen)
					: 0,
				currEquipSuc: r.currEquipSuc,
				currEquipDen: r.currEquipDen,
				prevEquipSuc: r.prevEquipSuc,
				prevEquipDen: r.prevEquipDen,
			}))
			.sort((a, b) => a.username.localeCompare(b.username));

		return res.json({
			rows,
			currentMonthLabel: currLabel,
			previousMonthLabel: prevLabel,
		});
	} catch (err) {
		console.error("[STATS][EQUIP][ERROR]", err);
		return res
			.status(500)
			.json({ error: "Failed to compute equipment stats" });
	} finally {
		console.log("[STATS][EQUIP] done in ms:", Date.now() - t0);
	}
});

/* ---------------- NEW: per-field success by month (no luxon) ----------------
   For each check field (checkone..checkten):
   - Denominator (per month): number of Check docs for that user in that Month
   - Numerator: those with the boolean true
--------------------------------------------------------------------------- */
/* ---------------- NEW: per-field success by month (no luxon) ----------------
   For each check field (checkone..checkten):
   - Denominator (per month): number of Check docs for that user in that Month
   - Numerator: those with the boolean true
   - Current month is **to date**: only include Day.dayNumber <= today (Pacific)
--------------------------------------------------------------------------- */
router.get("/user/:userId/check-fields", auth, async (req, res) => {
	try {
		const { userId } = req.params;
		if (!mongoose.isValidObjectId(userId)) {
			return res.status(400).json({ error: "Invalid userId" });
		}

		// Get current + previous month labels in Pacific time
		const nowTZ = tzParts(new Date(), APP_TZ);
		const prevTZ = shiftMonth(nowTZ, -1);
		const currentName = monthLabelFromParts(nowTZ); // e.g., "October 2025"
		const previousName = monthLabelFromParts(prevTZ); // e.g., "September 2025"
		const daysElapsed = nowTZ.d; // today's day-of-month in PT

		const CHECK_FIELDS = [
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

		// sum per-field trues
		const groupSums = CHECK_FIELDS.reduce((acc, f) => {
			acc[`${f}True`] = { $sum: { $cond: [`$${f}`, 1, 0] } };
			return acc;
		}, {});

		const results = await Check.aggregate([
			{ $match: { user: new mongoose.Types.ObjectId(userId) } },
			{
				$lookup: {
					from: "days",
					localField: "day",
					foreignField: "_id",
					as: "day",
				},
			},
			{ $unwind: "$day" },
			{
				$lookup: {
					from: "months",
					localField: "day.month",
					foreignField: "_id",
					as: "month",
				},
			},
			{ $unwind: "$month" },

			// #### KEY CHANGE: make current month "to date"
			// Include:
			//  - ALL of previous month, OR
			//  - current month rows where Day.dayNumber <= today (Pacific)
			{
				$match: {
					$or: [
						{ "month.name": previousName },
						{
							$and: [
								{ "month.name": currentName },
								{ "day.dayNumber": { $lte: daysElapsed } },
							],
						},
					],
				},
			},

			{
				$group: {
					_id: "$month.name",
					total: { $sum: 1 },
					...groupSums,
				},
			},
		]);

		const byName = Object.fromEntries(results.map((r) => [r._id, r]));
		function shape(name) {
			const row = byName[name] || { total: 0 };
			const total = row.total || 0;
			const fields = {};
			for (const f of CHECK_FIELDS) {
				const t = row[`${f}True`] || 0;
				fields[f] = {
					true: t,
					total,
					pct: total ? Math.round((t / total) * 100) : 0,
				};
			}
			return { name, fields, total };
		}

		return res.json({
			userId,
			currentMonth: shape(currentName),
			previousMonth: shape(previousName),
		});
	} catch (err) {
		console.error("[STATS][USER-FIELDS][ERROR]", err);
		return res
			.status(500)
			.json({ error: "Failed to compute user field stats" });
	}
});

module.exports = router;
