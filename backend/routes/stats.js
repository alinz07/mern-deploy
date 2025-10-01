// backend/routes/stats.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check"); // matches your schema with checkone..checkfive

const auth = require("../middleware/auth"); // sets req.user = { id, ... }

function monthLabel(date) {
	return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}
function firstDayOfMonth(d) {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastDayOfMonth(d) {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

router.get("/admin-checks", auth, async (req, res) => {
	try {
		// 🔹 Identify the calling admin & their org (don't rely on req.user.role since JWT omits it)
		const adminId = req.user?.id; // from JWT
		if (!adminId || !mongoose.isValidObjectId(adminId)) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		const adminOrg = await AdminUser.findOne({ ownerUser: adminId }).lean();
		if (!adminOrg) {
			// No org yet; still return labels so the header isn't "—"
			const now = new Date();
			const currLabel = monthLabel(now);
			const prevLabel = monthLabel(
				new Date(now.getFullYear(), now.getMonth() - 1, 1)
			);
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		// 🔹 Get all non-admin users in this org (role could be "student", etc.)
		const childUsers = await User.find({
			adminUser: adminOrg._id,
			role: { $ne: "admin" },
		})
			.select({ _id: 1, username: 1 })
			.lean();

		// Seed 0% rows for all child users
		const rowsMap = new Map(
			childUsers.map((u) => [
				String(u._id),
				{
					userId: String(u._id),
					username: u.username || "(unknown)",
					currSuccess: 0,
					prevSuccess: 0,
				},
			])
		);

		const now = new Date();
		const currLabel = monthLabel(now);
		const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const prevLabel = monthLabel(prevDate);
		const daysElapsedThisMonth = now.getDate(); // denominator (to date)
		const daysInPrevMonth = lastDayOfMonth(prevDate).getDate(); // full previous month

		// If no users, return early with labels
		if (childUsers.length === 0) {
			return res.json({
				rows: [],
				currentMonthLabel: currLabel,
				previousMonthLabel: prevLabel,
			});
		}

		const userIds = childUsers.map((u) => u._id);

		// 🔹 Find Month docs (if they exist) for current and previous month
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

		// 🔹 Gather Day docs for those months (if any)
		let dayDocs = [];
		if (monthsCurr.length || monthsPrev.length) {
			dayDocs = await Day.find({
				$or: [
					{ month: { $in: monthsCurr.map((m) => m._id) } },
					{ month: { $in: monthsPrev.map((m) => m._id) } },
				],
			})
				.select({ _id: 1, month: 1, dayNumber: 1, userId: 1 })
				.lean();
		}

		if (dayDocs.length) {
			const dayIds = dayDocs.map((d) => d._id);
			const dayById = new Map(dayDocs.map((d) => [String(d._id), d]));

			// 🔹 Your schema = one Check doc per (day,user) with five booleans.
			// A "successful day" requires ALL FIVE true.
			const successChecks = await Check.find({
				day: { $in: dayIds },
				user: { $in: userIds },
				checkone: true,
				checktwo: true,
				checkthree: true,
				checkfour: true,
				checkfive: true,
			})
				.select({ _id: 0, day: 1, user: 1 })
				.lean();

			for (const c of successChecks) {
				const d = dayById.get(String(c.day));
				if (!d) continue;

				const uid = String(c.user);
				const r = rowsMap.get(uid);
				if (!r) continue;

				const currMonthId = currByUser.get(uid);
				const prevMonthId = prevByUser.get(uid);

				if (currMonthId && String(d.month) === currMonthId) {
					// Only count up to "today"
					if (d.dayNumber <= daysElapsedThisMonth) r.currSuccess += 1;
				} else if (prevMonthId && String(d.month) === prevMonthId) {
					r.prevSuccess += 1;
				}
			}
		}

		// 🔹 Finalize percentages (every user appears; 0% if no data)
		const rows = Array.from(rowsMap.values())
			.map((r) => ({
				userId: r.userId,
				username: r.username,
				currentMonthPercent:
					daysElapsedThisMonth > 0
						? Math.round(
								(r.currSuccess / daysElapsedThisMonth) * 100
						  )
						: 0,
				previousMonthPercent:
					daysInPrevMonth > 0
						? Math.round((r.prevSuccess / daysInPrevMonth) * 100)
						: 0,
			}))
			.sort((a, b) => a.username.localeCompare(b.username));

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
