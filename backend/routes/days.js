const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Day = require("../models/Day");
const Month = require("../models/Month");
const mongoose = require("mongoose");
const User = require("../models/User");
const Check = require("../models/Check");

async function assertMonthTenant(monthId, adminUserId) {
	const m = await Month.findById(monthId).lean();
	if (!m) return { ok: false, status: 404, msg: "Month not found" };
	if (String(m.adminUser) !== String(adminUserId))
		return { ok: false, status: 403, msg: "Forbidden (tenant mismatch)" };
	return { ok: true, month: m };
}

// GET /api/days?monthId=...
router.get("/", auth, async (req, res) => {
	try {
		const { monthId } = req.query;
		if (!monthId)
			return res.status(400).json({ msg: "monthId is required" });

		const month = await Month.findById(monthId).lean();
		if (!month) return res.status(404).json({ msg: "Month not found" });
		if (String(month.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });
		}

		const q = { month: monthId };
		if (req.user.role !== "admin") q.userId = req.user.id;

		const days = await Day.find(q).sort({ dayNumber: 1 });
		return res.json(days);
	} catch (e) {
		res.status(500).json({ msg: "Server error", error: e.message });
	}
});

// POST /api/days/add
router.post("/add", auth, async (req, res) => {
	try {
		const {
			monthId,
			dayNumber,
			environment = "online",
			userId: targetUserId,
		} = req.body || {};
		if (!monthId || !mongoose.isValidObjectId(monthId))
			return res.status(400).json({ msg: "monthId is required" });
		if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31)
			return res.status(400).json({ msg: "dayNumber must be 1..31" });
		if (!["online", "inperson"].includes(environment))
			return res
				.status(400)
				.json({ msg: "environment must be 'online' or 'inperson'" });

		const chk = await assertMonthTenant(monthId, req.user.adminUser);
		if (!chk.ok) return res.status(chk.status).json({ msg: chk.msg });

		// owner: self unless admin impersonates same-tenant user
		let ownerUserId = req.user.id;
		if (
			req.user.role === "admin" &&
			targetUserId &&
			mongoose.isValidObjectId(targetUserId)
		) {
			const u = await User.findById(targetUserId)
				.select("adminUser")
				.lean();
			if (!u)
				return res.status(404).json({ msg: "Target user not found" });
			if (String(u.adminUser) !== String(req.user.adminUser))
				return res
					.status(403)
					.json({ msg: "Forbidden (tenant mismatch)" });
			ownerUserId = targetUserId;
		}

		// upsert Day
		const day = await Day.findOneAndUpdate(
			{ month: monthId, userId: ownerUserId, dayNumber },
			{
				$setOnInsert: {
					month: monthId,
					userId: ownerUserId,
					dayNumber,
				},
				$set: { environment },
			},
			{ new: true, upsert: true }
		);

		// ensure Check for that (day,user)
		const check = await Check.findOneAndUpdate(
			{ day: day._id, user: ownerUserId },
			{ $setOnInsert: { day: day._id, user: ownerUserId } },
			{ new: true, upsert: true }
		);

		return res.status(201).json({ day, check });
	} catch (e) {
		console.error("POST /days/add error:", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// POST /api/days/add-today
router.post("/add-today", auth, async (req, res) => {
	try {
		const { monthId, environment = "online", userId } = req.body || {};
		const today = new Date();
		const dayNumber = today.getDate();
		req.body.dayNumber = dayNumber;
		req.body.userId = userId;
		req.body.environment = environment;
		req.body.monthId = monthId;
		// Re-use the handler above
		req.url = "/add"; // internal reroute
		return router.handle(req, res);
	} catch (e) {
		console.error("POST /days/add-today error:", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
