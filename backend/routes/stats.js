// backend/routes/stats.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check"); // one doc per (day,user) with checkone..checkfive booleans

const auth = require("../middleware/auth"); // sets req.user = { id, ... }

function monthLabel(date) {
	return date.toLocaleString("en-US", { month: "long", year: "numeric" }); // e.g., "October 2025"
}
function lastDayOfMonth(d) {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

router.get("/admin-checks", auth, async (req, res) => {
	const t0 = Date.now();
	try {
		console.log("\n[STATS] ===== /api/stats/admin-checks =====");
		console.log("[STATS] req.user:", req.user);

		const adminId = req.user?.id;
		if (!adminId || !mongoose.isValidObjectId(adminId)) {
			console.log("[STATS] -> 401 (missing/invalid admin id)");
			return res.status(401).json({ error: "Unauthorized" });
		}

		// Resolve this admin’s org/tenant
		const adminOrg = await AdminUser.findOne({ ownerUser: adminId }).lean();
		console.log("[STATS] adminOrg _id:", adminOrg?._id || null);

		const now = new Date();
		const currLabel = monthLabel(now); // e.g., "October 2025"
		const prevAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const prevLabel = monthLabel(prevAnchor);

		const daysElapsedThisMonth = now.getDate(); // include today
		const daysInPrevMonth = lastDayOfMonth(prevAnchor).getDate(); // full previous month

		console.log(
			"[STATS] currLabel:",
			currLabel,
			"| prevLabel:",
			prevLabel,
			"| daysElapsedThisMonth (denom incl. today):",
			daysElapsedThisMonth,
			"| daysInPrevMonth (denom):",
			daysInPrevMonth
		);

		// If admin has no org yet, return empty (no users)
		if (!adminOrg) {
			console.log("[STATS] -> no AdminUser org; returning empty rows.");
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		// All non-admin users in this org (role can be "student", "user", etc.)
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

		// Seed per-user rows with 0s; we’ll bump counters if we find successes.
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

		// Find Month docs for these users by exact label
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

		// Mark which users actually have a Month doc per bucket
		for (const u of childUsers) {
			const uid = String(u._id);
			const r = rowsMap.get(uid);
			r.hasCurrMonth = currByUser.has(uid);
			r.hasPrevMonth = prevByUser.has(uid);
			if (!r.hasCurrMonth) {
				console.log(
					`[STATS] user "${u.username}" has NO current Month (${currLabel}). Will be 0% current.`
				);
			}
			if (!r.hasPrevMonth) {
				console.log(
					`[STATS] user "${u.username}" has NO previous Month (${prevLabel}). Will be 0% previous.`
				);
			}
		}

		// If there are zero Month docs in both buckets, we still return all users with 0%
		if (monthsCurr.length === 0 && monthsPrev.length === 0) {
			console.log(
				"[STATS] -> no months found for either bucket; returning rows with 0%."
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

		// Load Day docs for those months (if any)
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

			// SUCCESS: a Check exists for that day with all five booleans true.
			// IMPORTANT: do NOT filter by Check.user here; credit the Day's owner (d.userId).
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

				const uid = String(d.userId); // derive owner from the Day itself
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

		// Finalize percentages
		const rows = Array.from(rowsMap.values())
			.map((r) => {
				const currentMonthPercent = r.hasCurrMonth
					? daysElapsedThisMonth > 0
						? Math.round(
								(r.currSuccess / daysElapsedThisMonth) * 100
						  )
						: 0
					: 0; // if no Month for current, show 0%

				const previousMonthPercent = r.hasPrevMonth
					? daysInPrevMonth > 0
						? Math.round((r.prevSuccess / daysInPrevMonth) * 100)
						: 0
					: 0; // if no Month for previous, show 0%

				return {
					userId: r.userId,
					username: r.username,
					currentMonthPercent,
					previousMonthPercent,
				};
			})
			.sort((a, b) => a.username.localeCompare(b.username));

		console.log("[STATS] rows (sample):", rows.slice(0, 5));
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
