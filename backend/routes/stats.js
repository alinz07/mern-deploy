// backend/routes/stats.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check");

const auth = require("../middleware/auth");

// ===== Timezone helpers (use a fixed app TZ to avoid UTC drift) =====
const APP_TZ = "America/Los_Angeles"; // change if you prefer a different canonical TZ

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
	// Returns { y, m, d } in the given timezone (m = 1..12)
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		year: "numeric",
		month: "numeric",
		day: "numeric",
	});
	const parts = fmt.formatToParts(date);
	// parts order is locale-dependent; find by type
	const y = +parts.find((p) => p.type === "year").value;
	const m = +parts.find((p) => p.type === "month").value;
	const d = +parts.find((p) => p.type === "day").value;
	return { y, m, d };
}

function monthLabelFromParts({ y, m }) {
	return `${MONTH_NAMES[m - 1]} ${y}`; // e.g., "October 2025"
}

// Shift month by delta (can be negative) in the given tz, returning parts
function shiftMonth({ y, m, d }, delta) {
	const newM = m + delta;
	const y2 = y + Math.floor((newM - 1) / 12);
	let m2 = (newM - 1) % 12;
	if (m2 < 0) m2 += 12;
	m2 += 1; // back to 1..12
	// clamp day (not really needed for label/denominator computation)
	const d2 = d;
	return { y: y2, m: m2, d: d2 };
}

// last day of (y,m) in the target tz
function lastDayOfMonthTZ({ y, m }, tz = APP_TZ) {
	// Construct a date safely: take 1st of next month then go back 1 day.
	const nextMonth = shiftMonth({ y, m, d: 1 }, +1);
	const asDate = new Date(
		`${MONTH_NAMES[nextMonth.m - 1]} 1, ${nextMonth.y} 00:00:00 GMT`
	);
	// step back one day in ms
	const oneDay = 24 * 60 * 60 * 1000;
	const prev = new Date(asDate.getTime() - oneDay);

	// Extract the "day" in target tz to avoid DST/UTC surprises
	return tzParts(prev, tz).d;
}

router.get("/admin-checks", auth, async (req, res) => {
	const t0 = Date.now();
	try {
		console.log("\n[STATS] ===== /api/stats/admin-checks =====");
		console.log("[STATS] server now (system tz):", new Date().toString());
		console.log("[STATS] req.user:", req.user);

		const adminId = req.user?.id;
		if (!adminId || !mongoose.isValidObjectId(adminId)) {
			console.log("[STATS] -> 401 (missing/invalid admin id)");
			return res.status(401).json({ error: "Unauthorized" });
		}

		// Resolve this admin’s org/tenant
		const adminOrg = await AdminUser.findOne({ ownerUser: adminId }).lean();
		console.log("[STATS] adminOrg _id:", adminOrg?._id || null);

		// ---- Timezone-accurate "now" parts and labels ----
		const nowTZ = tzParts(new Date(), APP_TZ); // e.g., {y:2025,m:10,d:2}
		const prevTZ = shiftMonth(nowTZ, -1); // previous month parts
		const currLabel = monthLabelFromParts(nowTZ); // "October 2025"
		const prevLabel = monthLabelFromParts(prevTZ); // "September 2025"

		// Denominators
		const daysElapsedThisMonth = nowTZ.d; // include "today" in target TZ
		const daysInPrevMonth = lastDayOfMonthTZ(prevTZ, APP_TZ);

		console.log(
			"[STATS] TZ:",
			APP_TZ,
			"| nowTZ:",
			nowTZ,
			"| prevTZ:",
			prevTZ,
			"| currLabel:",
			currLabel,
			"| prevLabel:",
			prevLabel,
			"| daysElapsedThisMonth:",
			daysElapsedThisMonth,
			"| daysInPrevMonth:",
			daysInPrevMonth
		);

		if (!adminOrg) {
			console.log("[STATS] -> no AdminUser org; returning empty rows.");
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		// All non-admin users in this org
		const childUsers = await User.find({
			adminUser: adminOrg._id,
			role: { $ne: "admin" },
		})
			.select({ _id: 1, username: 1 })
			.lean();

		console.log("[STATS] childUsers count:", childUsers.length);
		if (childUsers.length === 0) {
			console.log("[STATS] -> no child users; returning empty rows.");
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		const userIds = childUsers.map((u) => u._id);

		// Seed per-user rows with 0s
		const rowsMap = new Map(
			childUsers.map((u) => [
				String(u._id),
				{
					userId: String(u._id),
					username: u.username || "(unknown)",
					currSuccess: 0,
					prevSuccess: 0,
					hasCurrMonth: false,
					hasPrevMonth: false,
				},
			])
		);

		// Find Month docs by exact label
		const [monthsCurr, monthsPrev] = await Promise.all([
			Month.find({ name: currLabel, userId: { $in: userIds } })
				.select({ _id: 1, userId: 1, name: 1 })
				.lean(),
			Month.find({ name: prevLabel, userId: { $in: userIds } })
				.select({ _id: 1, userId: 1, name: 1 })
				.lean(),
		]);

		console.log(
			"[STATS] monthsCurr count:",
			monthsCurr.length,
			"| monthsPrev count:",
			monthsPrev.length
		);

		const currByUser = new Map(
			monthsCurr.map((m) => [String(m.userId), String(m._id)])
		);
		const prevByUser = new Map(
			monthsPrev.map((m) => [String(m.userId), String(m._id)])
		);

		// Mark month presence per user
		for (const u of childUsers) {
			const uid = String(u._id);
			const r = rowsMap.get(uid);
			r.hasCurrMonth = currByUser.has(uid);
			r.hasPrevMonth = prevByUser.has(uid);
			if (!r.hasCurrMonth)
				console.log(
					`[STATS] user "${u.username}" has NO current Month (${currLabel}). 0% current.`
				);
			if (!r.hasPrevMonth)
				console.log(
					`[STATS] user "${u.username}" has NO previous Month (${prevLabel}). 0% previous.`
				);
		}

		if (monthsCurr.length === 0 && monthsPrev.length === 0) {
			console.log(
				"[STATS] -> no months for either bucket; returning rows with 0%."
			);
			const rows0 = Array.from(rowsMap.values())
				.map((r) => ({
					userId: r.userId,
					username: r.username,
					currentMonthPercent: 0,
					previousMonthPercent: 0,
				}))
				.sort((a, b) => a.username.localeCompare(b.username));
			console.log("[STATS] rows (sample):", rows0.slice(0, 5));
			console.log("[STATS] done in ms:", Date.now() - t0);
			return res.json({
				rows: rows0,
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		// Load Day docs for those months
		const monthIdsToLoad = [
			...monthsCurr.map((m) => m._id),
			...monthsPrev.map((m) => m._id),
		];
		const dayDocs = await Day.find({ month: { $in: monthIdsToLoad } })
			.select({ _id: 1, month: 1, dayNumber: 1, userId: 1 })
			.lean();

		console.log("[STATS] dayDocs count:", dayDocs.length);

		if (dayDocs.length > 0) {
			const dayIds = dayDocs.map((d) => d._id);
			const dayById = new Map(dayDocs.map((d) => [String(d._id), d]));

			// SUCCESS = exists a Check with all five true (credit to the Day.owner)
			const successChecks = await Check.find({
				day: { $in: dayIds },
				checkone: true,
				checktwo: true,
				checkthree: true,
				checkfour: true,
				checkfive: true,
			})
				.select({ _id: 0, day: 1 })
				.lean();

			console.log(
				"[STATS] successChecks (all-5-true) count:",
				successChecks.length
			);

			for (const c of successChecks) {
				const d = dayById.get(String(c.day));
				if (!d) continue;

				const uid = String(d.userId);
				const r = rowsMap.get(uid);
				if (!r) continue;

				const currMonthId = currByUser.get(uid);
				const prevMonthId = prevByUser.get(uid);

				if (currMonthId && String(d.month) === currMonthId) {
					if (
						typeof d.dayNumber === "number" &&
						d.dayNumber <= daysElapsedThisMonth
					) {
						r.currSuccess += 1;
					} else if (typeof d.dayNumber !== "number") {
						console.log(
							`[STATS][WARN] Day ${d._id} for user ${uid} has invalid dayNumber:`,
							d.dayNumber
						);
					}
				} else if (prevMonthId && String(d.month) === prevMonthId) {
					r.prevSuccess += 1;
				}
			}
		}

		// Finalize rows with TZ-safe denominators
		const rows = Array.from(rowsMap.values())
			.map((r) => {
				const currentMonthPercent = r.hasCurrMonth
					? daysElapsedThisMonth > 0
						? Math.round(
								(r.currSuccess / daysElapsedThisMonth) * 100
						  )
						: 0
					: 0;

				const previousMonthPercent = r.hasPrevMonth
					? daysInPrevMonth > 0
						? Math.round((r.prevSuccess / daysInPrevMonth) * 100)
						: 0
					: 0;

				return {
					userId: r.userId,
					username: r.username,
					currentMonthPercent,
					previousMonthPercent,
				};
			})
			.sort((a, b) => a.username.localeCompare(b.username));

		// Per-user debug (first few)
		console.log("[STATS] sample tallies:");
		for (const r of rows.slice(0, 5)) {
			console.log(
				`  - ${r.username}: currSuccess=${
					rowsMap.get(r.userId).currSuccess
				}/${daysElapsedThisMonth} (${
					r.currentMonthPercent
				}%), prevSuccess=${
					rowsMap.get(r.userId).prevSuccess
				}/${daysInPrevMonth} (${r.previousMonthPercent}%)`
			);
		}
		console.log("[STATS] done in ms:", Date.now() - t0);

		return res.json({
			rows,
			currentMonthLabel: currLabel,
			previousMonthLabel: prevLabel,
		});
	} catch (err) {
		console.error("[STATS][ERROR]", err);
		return res.status(500).json({ error: "Failed to compute stats" });
	}
});

module.exports = router;
