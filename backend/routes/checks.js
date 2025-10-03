// routes/checks.js (DROP-IN)
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Check = require("../models/Check");
const Day = require("../models/Day");
const Month = require("../models/Month");
const User = require("../models/User");

// helper: assert day & user are in caller's tenant (admin only)
async function assertSameTenantByDayAndUser(dayId, targetUserId, adminUserId) {
	if (
		!mongoose.isValidObjectId(dayId) ||
		!mongoose.isValidObjectId(targetUserId) ||
		!mongoose.isValidObjectId(adminUserId)
	) {
		return { ok: false, status: 400, msg: "Invalid id(s)" };
	}
	const day = await Day.findById(dayId).lean();
	if (!day) return { ok: false, status: 404, msg: "Day not found" };
	const month = await Month.findById(day.month).lean();
	if (!month) return { ok: false, status: 404, msg: "Month not found" };
	const targetUser = await User.findById(targetUserId)
		.select({ adminUser: 1 })
		.lean();
	if (!targetUser)
		return { ok: false, status: 404, msg: "Target user not found" };

	if (
		String(month.adminUser) !== String(adminUserId) ||
		String(targetUser.adminUser) !== String(adminUserId)
	) {
		return { ok: false, status: 403, msg: "Forbidden (tenant mismatch)" };
	}
	return { ok: true, day, month, targetUserId };
}

// helper: assert day belongs to caller's tenant (your original helper)
async function assertSameTenant(dayId, adminUserId) {
	const day = await Day.findById(dayId).lean();
	if (!day) return { ok: false, status: 404, msg: "Day not found" };
	const month = await Month.findById(day.month).lean();
	if (!month) return { ok: false, status: 404, msg: "Month not found" };
	if (String(month.adminUser) !== String(adminUserId)) {
		return { ok: false, status: 403, msg: "Forbidden (tenant mismatch)" };
	}
	return { ok: true, day, month };
}

// Ensure a Check exists for (dayId, user) and return it
// NOW supports admin acting for a student via { userId }
router.post("/", auth, async (req, res) => {
	try {
		const { dayId, userId: targetUserId } = req.body;
		if (!dayId || !mongoose.isValidObjectId(dayId))
			return res.status(400).json({ msg: "dayId is required" });

		// tenant check on the day
		const checkTenant = await assertSameTenant(dayId, req.user.adminUser);
		if (!checkTenant.ok)
			return res
				.status(checkTenant.status)
				.json({ msg: checkTenant.msg });

		// default = caller; if admin passed userId, impersonate the student (same tenant only)
		let ownerUserId = req.user.id;
		if (
			req.user.role === "admin" &&
			targetUserId &&
			mongoose.isValidObjectId(targetUserId)
		) {
			const guard = await assertSameTenantByDayAndUser(
				dayId,
				targetUserId,
				req.user.adminUser
			);
			if (!guard.ok)
				return res.status(guard.status).json({ msg: guard.msg });
			ownerUserId = targetUserId;
		}

		const check = await Check.findOneAndUpdate(
			{ day: dayId, user: ownerUserId },
			{ $setOnInsert: { day: dayId, user: ownerUserId } },
			{ new: true, upsert: true }
		);
		res.json(check);
	} catch (err) {
		console.error("POST /api/checks error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

// Get checks for a day
// NOW supports admin reading a specific student's check via ?userId=...,
// or all checks via &all=1 (your original behavior).
router.get("/", auth, async (req, res) => {
	try {
		const { dayId, all, userId: targetUserId } = req.query;
		if (!dayId || !mongoose.isValidObjectId(dayId))
			return res.status(400).json({ msg: "dayId is required" });

		const checkTenant = await assertSameTenant(dayId, req.user.adminUser);
		if (!checkTenant.ok)
			return res
				.status(checkTenant.status)
				.json({ msg: checkTenant.msg });

		let query;
		if (req.user.role === "admin" && all === "1") {
			query = { day: dayId }; // all users’ checks for that day
		} else if (
			req.user.role === "admin" &&
			targetUserId &&
			mongoose.isValidObjectId(targetUserId)
		) {
			const guard = await assertSameTenantByDayAndUser(
				dayId,
				targetUserId,
				req.user.adminUser
			);
			if (!guard.ok)
				return res.status(guard.status).json({ msg: guard.msg });
			query = { day: dayId, user: targetUserId };
		} else {
			query = { day: dayId, user: req.user.id };
		}

		const checks = await Check.find(query).lean();
		res.json(checks);
	} catch (err) {
		console.error("GET /api/checks error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

// Update booleans on a Check (unchanged except your existing owner-or-admin guard)
router.patch("/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await Check.findById(id);
		if (!doc) return res.status(404).json({ msg: "Check not found" });

		const checkTenant = await assertSameTenant(doc.day, req.user.adminUser);
		if (!checkTenant.ok)
			return res
				.status(checkTenant.status)
				.json({ msg: checkTenant.msg });

		if (String(doc.user) !== req.user.id && req.user.role !== "admin") {
			return res.status(403).json({ msg: "Forbidden" });
		}

		[
			"checkone",
			"checktwo",
			"checkthree",
			"checkfour",
			"checkfive",
		].forEach((f) => {
			if (typeof req.body[f] === "boolean") doc[f] = req.body[f];
		});

		await doc.save();
		res.json(doc);
	} catch (err) {
		console.error("PATCH /api/checks/:id error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
