const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Day = require("../models/Day");
const Month = require("../models/Month");
const mongoose = require("mongoose");
const User = require("../models/User");
const Check = require("../models/Check");

const APP_TZ = "America/Los_Angeles";

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
		console.error("GET /days error:", e);
		res.status(500).json({ msg: "Server error", error: e.message });
	}
});

// ---- core handler (used by both /add and /add-today) ----
async function addOrUpdateDayAndCheck({
	reqUser,
	monthId,
	dayNumber,
	environment = "online",
	targetUserId, // optional: admin acting for student
	treatExistingAs = "updated", // "updated" or "exists" (for /add-today UX)
}) {
	const chk = await assertMonthTenant(monthId, reqUser.adminUser);
	if (!chk.ok) return { error: { status: chk.status, msg: chk.msg } };

	// Determine owner (self unless admin impersonates same-tenant user)
	let ownerUserId = reqUser.id;
	if (
		reqUser.role === "admin" &&
		targetUserId &&
		mongoose.isValidObjectId(targetUserId)
	) {
		const u = await User.findById(targetUserId).select("adminUser").lean();
		if (!u) return { error: { status: 404, msg: "Target user not found" } };
		if (String(u.adminUser) !== String(reqUser.adminUser)) {
			return {
				error: { status: 403, msg: "Forbidden (tenant mismatch)" },
			};
		}
		ownerUserId = targetUserId;
	}

	const filter = { month: monthId, userId: ownerUserId, dayNumber };

	// 1) Check first to avoid duplicate-key races
	let day = await Day.findOne(filter);
	if (day) {
		// Existing: update environment if changed
		if (day.environment !== environment) {
			day.environment = environment;
			await day.save();
		}
		// Ensure Check exists
		const check = await Check.findOneAndUpdate(
			{ day: day._id, user: ownerUserId },
			{ $setOnInsert: { day: day._id, user: ownerUserId } },
			{ new: true, upsert: true }
		);
		return { day, check, action: treatExistingAs }; // "exists" for today, "updated" for add
	}

	// 2) Create new Day + Check
	day = await Day.create({
		month: monthId,
		userId: ownerUserId,
		dayNumber,
		environment,
	});
	const check = await Check.findOneAndUpdate(
		{ day: day._id, user: ownerUserId },
		{ $setOnInsert: { day: day._id, user: ownerUserId } },
		{ new: true, upsert: true }
	);
	return { day, check, action: "created" };
}

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

		const out = await addOrUpdateDayAndCheck({
			reqUser: req.user,
			monthId,
			dayNumber,
			environment,
			targetUserId,
			treatExistingAs: "updated",
		});
		if (out.error)
			return res.status(out.error.status).json({ msg: out.error.msg });
		return res.status(out.action === "created" ? 201 : 200).json(out);
	} catch (e) {
		console.error("POST /days/add error:", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// POST /api/days/add-today  (Pacific Time)
router.post("/add-today", auth, async (req, res) => {
	try {
		const { monthId, environment = "online", userId } = req.body || {};
		if (!monthId || !mongoose.isValidObjectId(monthId))
			return res.status(400).json({ msg: "monthId is required" });
		if (!["online", "inperson"].includes(environment))
			return res
				.status(400)
				.json({ msg: "environment must be 'online' or 'inperson'" });

		// Day-of-month in Pacific Time
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: APP_TZ,
			day: "numeric",
		})
			.formatToParts(new Date())
			.find((p) => p.type === "day");
		const dayNumber = parts
			? parseInt(parts.value, 10)
			: new Date().getDate();

		const out = await addOrUpdateDayAndCheck({
			reqUser: req.user,
			monthId,
			dayNumber,
			environment,
			targetUserId: userId,
			treatExistingAs: "exists", // UX: "Today already exists."
		});
		if (out.error)
			return res.status(out.error.status).json({ msg: out.error.msg });
		return res.status(out.action === "created" ? 201 : 200).json(out);
	} catch (e) {
		console.error("POST /days/add-today error:", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
