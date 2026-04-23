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
		`${MONTH_NAMES[nextMonth.m - 1]} 1, ${nextMonth.y} 00:00:00 GMT`,
	);
	const prev = new Date(asDate.getTime() - 24 * 60 * 60 * 1000);
	const { d } = tzParts(prev, tz);
	return d;
}

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
					currOnlineMissed: 0,
					currInpersonMissed: 0,
					prevOnlineMissed: 0,
					prevInpersonMissed: 0,
				},
			]),
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
			monthsCurr.map((m) => [String(m.userId), String(m._id)]),
		);
		const prevByUser = new Map(
			monthsPrev.map((m) => [String(m.userId), String(m._id)]),
		);

		const monthIdsToLoad = [
			...monthsCurr.map((m) => m._id),
			...monthsPrev.map((m) => m._id),
		];

		if (monthIdsToLoad.length === 0) {
			return res.json({
				rows: Array.from(rowsMap.values()).sort((a, b) =>
					a.username.localeCompare(b.username),
				),
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

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

		const checkDocs = await Check.find({
			day: { $in: dayDocs.map((d) => d._id) },
		})
			.select({
				day: 1,
				checkone: 1,
				checktwo: 1,
				checkthree: 1,
				checkfour: 1,
				checkfive: 1,
				checksix: 1,
				checkseven: 1,
				checkeight: 1,
				checknine: 1,
				checkten: 1,
			})
			.lean();

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

		for (const c of checkDocs) {
			const d = dayById.get(String(c.day));
			if (!d) continue;

			const uid = String(d.userId);
			const r = rowsMap.get(uid);
			if (!r) continue;

			const env = d.environment === "inperson" ? "inperson" : "online";
			const currMonthId = currByUser.get(uid);
			const prevMonthId = prevByUser.get(uid);

			const missedCount = CHECK_FIELDS.reduce(
				(sum, f) => sum + (c[f] === false ? 1 : 0),
				0,
			);

			if (missedCount === 0) continue;

			if (currMonthId && String(d.month) === currMonthId) {
				if (typeof d.dayNumber === "number" && d.dayNumber <= nowTZ.d) {
					if (env === "online") r.currOnlineMissed += missedCount;
					else r.currInpersonMissed += missedCount;
				}
			} else if (prevMonthId && String(d.month) === prevMonthId) {
				if (env === "online") r.prevOnlineMissed += missedCount;
				else r.prevInpersonMissed += missedCount;
			}
		}

		const rows = Array.from(rowsMap.values()).sort((a, b) =>
			a.username.localeCompare(b.username),
		);

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

/* ---------------- Equipment stats: count missed individual checks ---------------- */
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

		const rowsMap = new Map(
			childUsers.map((u) => [
				String(u._id),
				{
					userId: String(u._id),
					username: u.username || "(unknown)",
					currEquipMissed: 0,
					prevEquipMissed: 0,
				},
			]),
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
			monthsCurr.map((m) => [String(m.userId), String(m._id)]),
		);
		const prevByUser = new Map(
			monthsPrev.map((m) => [String(m.userId), String(m._id)]),
		);

		const allMonthIds = [
			...monthsCurr.map((m) => String(m._id)),
			...monthsPrev.map((m) => String(m._id)),
		];

		if (allMonthIds.length === 0) {
			return res.json({
				rows: Array.from(rowsMap.values()).sort((a, b) =>
					a.username.localeCompare(b.username),
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
			dayDocs.map((d) => [String(d._id), d.dayNumber || 0]),
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

			const missedCount =
				(ec.left === false ? 1 : 0) +
				(ec.right === false ? 1 : 0) +
				(ec.both === false ? 1 : 0) +
				(ec.fmMic === false ? 1 : 0);

			if (missedCount === 0) continue;

			if (isCurr) {
				const dn = dayNumById.get(String(ec.day)) || 0;
				if (dn > 0 && dn <= nowTZ.d) {
					r.currEquipMissed += missedCount;
				}
			} else if (isPrev) {
				r.prevEquipMissed += missedCount;
			}
		}

		const rows = Array.from(rowsMap.values()).sort((a, b) =>
			a.username.localeCompare(b.username),
		);

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

// /api/stats/user/:userId/check-fields  (day-first, PT "to-date")
router.get("/user/:userId/check-fields", auth, async (req, res) => {
	try {
		const { userId } = req.params;
		if (!mongoose.isValidObjectId(userId)) {
			return res.status(400).json({ error: "Invalid userId" });
		}

		const nowTZ = tzParts(new Date(), APP_TZ);
		const prevTZ = shiftMonth(nowTZ, -1);
		const currentName = monthLabelFromParts(nowTZ);
		const previousName = monthLabelFromParts(prevTZ);
		const daysElapsed = nowTZ.d;

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

		const EQUIP_FIELDS = ["left", "right", "both", "fmMic"];

		const monthDocs = await Month.find({
			userId,
			name: { $in: [currentName, previousName] },
		})
			.select({ _id: 1, name: 1 })
			.lean();

		const monthNameById = new Map(
			monthDocs.map((m) => [String(m._id), m.name]),
		);

		const dayDocs = await Day.find({
			userId: new mongoose.Types.ObjectId(userId),
			month: { $in: monthDocs.map((m) => m._id) },
		})
			.select({ _id: 1, month: 1, dayNumber: 1 })
			.lean();

		const scopedDaysByMonth = {
			[currentName]: [],
			[previousName]: [],
		};

		for (const d of dayDocs) {
			const monthName = monthNameById.get(String(d.month));
			if (!monthName) continue;

			if (monthName === currentName) {
				if (
					typeof d.dayNumber === "number" &&
					d.dayNumber <= daysElapsed
				) {
					scopedDaysByMonth[currentName].push(d);
				}
			} else if (monthName === previousName) {
				scopedDaysByMonth[previousName].push(d);
			}
		}

		const scopedDayIds = [
			...scopedDaysByMonth[currentName].map((d) => d._id),
			...scopedDaysByMonth[previousName].map((d) => d._id),
		];

		const [checkDocs, equipDocs] = await Promise.all([
			scopedDayIds.length
				? Check.find({
						user: userId,
						day: { $in: scopedDayIds },
					})
						.select({
							day: 1,
							checkone: 1,
							checktwo: 1,
							checkthree: 1,
							checkfour: 1,
							checkfive: 1,
							checksix: 1,
							checkseven: 1,
							checkeight: 1,
							checknine: 1,
							checkten: 1,
						})
						.lean()
				: [],
			scopedDayIds.length
				? EquipmentCheck.find({
						user: userId,
						day: { $in: scopedDayIds },
					})
						.select({
							day: 1,
							left: 1,
							right: 1,
							both: 1,
							fmMic: 1,
						})
						.lean()
				: [],
		]);

		const checkByDayId = new Map(checkDocs.map((c) => [String(c.day), c]));
		const equipByDayId = new Map(equipDocs.map((e) => [String(e.day), e]));

		function buildMonthShape(name) {
			const days = scopedDaysByMonth[name] || [];
			const totalDays = days.length;

			let equipmentAllPresentDays = 0;

			for (const d of days) {
				const eq = equipByDayId.get(String(d._id));
				if (
					eq &&
					eq.left === true &&
					eq.right === true &&
					eq.both === true &&
					eq.fmMic === true
				) {
					equipmentAllPresentDays += 1;
				}
			}

			const equipmentAllPresentPct = totalDays
				? Math.round((equipmentAllPresentDays / totalDays) * 100)
				: 0;

			const fields = {};

			for (const field of CHECK_FIELDS) {
				let missed = 0;
				const equipmentMissing = {
					left: 0,
					right: 0,
					both: 0,
					fmMic: 0,
				};

				for (const d of days) {
					const check = checkByDayId.get(String(d._id));
					if (!check) continue;

					if (check[field] === false) {
						missed += 1;

						const eq = equipByDayId.get(String(d._id));
						if (!eq) continue;

						for (const ef of EQUIP_FIELDS) {
							if (eq[ef] === false) {
								equipmentMissing[ef] += 1;
							}
						}
					}
				}

				fields[field] = {
					missed,
					equipmentMissing,
				};
			}

			return {
				name,
				totalDays,
				equipmentAllPresentDays,
				equipmentAllPresentPct,
				fields,
			};
		}

		return res.json({
			userId,
			currentMonth: buildMonthShape(currentName),
			previousMonth: buildMonthShape(previousName),
		});
	} catch (err) {
		console.error("[STATS][USER-FIELDS][ERROR]", err?.message, err?.stack);
		return res
			.status(500)
			.json({ error: "Failed to compute user field stats" });
	}
});

module.exports = router;
