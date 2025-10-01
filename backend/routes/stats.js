// backend/routes/stats.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const Month = require("../models/Month");
const Day = require("../models/Day");

// IMPORTANT: use your existing auth middleware that populates req.user
const auth = require("../middleware/auth"); // adjust path/name if different

// We expect a Check model with schema that references { day: ObjectId, checked: Boolean, ... }
// and represents five checkboxes per day (five docs or five booleans). We'll treat it as
// one doc per checkbox (common in your /api/checks usage) and count checked===true per day.
const Check = mongoose.models.Check || mongoose.model("Check");

function monthLabel(date) {
	return date.toLocaleString("en-US", { month: "long", year: "numeric" }); // e.g., "September 2025"
}

function firstDayOfMonth(d) {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastDayOfMonth(d) {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

router.get("/admin-checks", auth, async (req, res) => {
	try {
		// Ensure only admins hit this
		if (!req.user || req.user.role !== "admin") {
			return res.status(403).json({ error: "Admin only" });
		}

		// Find the admin org this admin owns
		const adminOrg = await AdminUser.findOne({
			ownerUser: req.user._id,
		}).lean();
		if (!adminOrg) {
			return res.json({ rows: [] });
		}

		// Get child (non-admin) users in this org
		const childUsers = await User.find({
			adminUser: adminOrg._id,
			role: "user",
		})
			.select({ _id: 1, username: 1 })
			.lean();

		if (childUsers.length === 0) {
			return res.json({ rows: [] });
		}

		const now = new Date(); // e.g., Sep 30, 2025
		const currFirst = firstDayOfMonth(now); // Sep 1, 2025
		const currLabel = monthLabel(now); // "September 2025"
		const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const prevFirst = firstDayOfMonth(prevDate); // Aug 1, 2025
		const prevLast = lastDayOfMonth(prevDate); // Aug 31, 2025
		const prevLabel = monthLabel(prevDate); // "August 2025"

		// Denominators:
		// - current month = days elapsed up to today (inclusive of today)
		const daysElapsedThisMonth = now.getDate();
		// - previous month = total days in that month
		const daysInPrevMonth = prevLast.getDate();

		// Fetch Month docs for these users for current and previous month labels
		const [monthsCurr, monthsPrev] = await Promise.all([
			Month.find({
				name: currLabel,
				userId: { $in: childUsers.map((u) => u._id) },
			})
				.select({ _id: 1, userId: 1 })
				.lean(),
			Month.find({
				name: prevLabel,
				userId: { $in: childUsers.map((u) => u._id) },
			})
				.select({ _id: 1, userId: 1 })
				.lean(),
		]);

		const monthByUser = (arr) => {
			const m = new Map();
			for (const x of arr) m.set(String(x.userId), x._id);
			return m;
		};
		const currByUser = monthByUser(monthsCurr);
		const prevByUser = monthByUser(monthsPrev);

		// Get Days for those months (we'll group success by day via checks)
		const dayDocs = await Day.find({
			$or: [
				{ month: { $in: monthsCurr.map((m) => m._id) } },
				{ month: { $in: monthsPrev.map((m) => m._id) } },
			],
		})
			.select({ _id: 1, month: 1, dayNumber: 1, userId: 1 })
			.lean();

		const dayIds = dayDocs.map((d) => d._id);

		// Gather check counts per day: count how many checks are true on that day.
		// We consider a "successful day" iff checked===true count is 5.
		const checksAgg = await Check.aggregate([
			{ $match: { day: { $in: dayIds }, checked: true } },
			{ $group: { _id: "$day", trueCount: { $sum: 1 } } },
			{ $project: { _id: 1, isSuccess: { $eq: ["$trueCount", 5] } } },
		]);

		const successByDay = new Map(
			checksAgg.map((x) => [String(x._id), !!x.isSuccess])
		);

		// Tally successes by user for current vs previous month (with denominators above)
		const tally = new Map(); // userId -> { userId, username, currSuccess, prevSuccess }
		const usernameById = new Map(
			childUsers.map((u) => [String(u._id), u.username])
		);

		for (const d of dayDocs) {
			const uid = String(d.userId);
			const row = tally.get(uid) || {
				userId: uid,
				username: usernameById.get(uid),
				currSuccess: 0,
				prevSuccess: 0,
			};
			const ok = successByDay.get(String(d._id)) === true;

			// Day belongs to which bucket?
			if (
				currByUser.get(uid) &&
				String(d.month) === String(currByUser.get(uid))
			) {
				// Only count up to "today" for current month
				if (d.dayNumber <= daysElapsedThisMonth && ok)
					row.currSuccess += 1;
			} else if (
				prevByUser.get(uid) &&
				String(d.month) === String(prevByUser.get(uid))
			) {
				// Count all days in prev month
				if (ok) row.prevSuccess += 1;
			}
			tally.set(uid, row);
		}

		const rows = [];
		for (const [uid, row] of tally) {
			const currPct =
				daysElapsedThisMonth > 0
					? Math.round((row.currSuccess / daysElapsedThisMonth) * 100)
					: 0;
			const prevPct =
				daysInPrevMonth > 0
					? Math.round((row.prevSuccess / daysInPrevMonth) * 100)
					: 0;

			rows.push({
				userId: uid,
				username: row.username || "(unknown)",
				currentMonthPercent: currPct,
				previousMonthPercent: prevPct,
			});
		}

		// Only send users; admins aren't in childUsers query
		rows.sort((a, b) => a.username.localeCompare(b.username));
		res.json({
			rows,
			currentMonthLabel: currLabel,
			previousMonthLabel: prevLabel,
		});
	} catch (err) {
		console.error("stats/admin-checks error:", err);
		res.status(500).json({ error: "Failed to compute stats" });
	}
});

module.exports = router;
