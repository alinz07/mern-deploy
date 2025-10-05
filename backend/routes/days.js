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

// ---- core upsert used by both /add and /add-today ----
async function createOrUpdateDayAndCheck({
	reqUser,
	monthId,
	dayNumber,
	environment = "online",
	targetUserId, // optional: admin can act for a student
}) {
	const chk = await assertMonthTenant(monthId, reqUser.adminUser);
	if (!chk.ok) return { error: { status: chk.status, msg: chk.msg } };

	// owner: self unless admin impersonates same-tenant user
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

	try {
		// Upsert Day and detect created vs updated
		const result = await Day.findOneAndUpdate(
			filter,
			{
				$setOnInsert: {
					month: monthId,
					userId: ownerUserId,
					dayNumber,
				},
				$set: { environment },
			},
			{ new: true, upsert: true, rawResult: true }
		);

		const day = result.value;
		const updatedExisting = !!result.lastErrorObject?.updatedExisting;
		const action = updatedExisting ? "updated" : "created";

		// Ensure Check exists for that (day,user)
		const check = await Check.findOneAndUpdate(
			{ day: day._id, user: ownerUserId },
			{ $setOnInsert: { day: day._id, user: ownerUserId } },
			{ new: true, upsert: true }
		);

		return { day, check, action };
	} catch (e) {
		// If another request created the same Day just before this one, treat it as "updated"
		if (
			e &&
			(e.code === 11000 || String(e.message || "").includes("E11000"))
		) {
			const day = await Day.findOneAndUpdate(
				filter,
				{ $set: { environment } }, // update env if caller changed it
				{ new: true }
			);
			const check = await Check.findOneAndUpdate(
				{ day: day._id, user: ownerUserId },
				{ $setOnInsert: { day: day._id, user: ownerUserId } },
				{ new: true, upsert: true }
			);
			return { day, check, action: "updated" };
		}
		console.error("createOrUpdateDayAndCheck error:", e);
		return { error: { status: 500, msg: "Server error" } };
	}
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

		const out = await createOrUpdateDayAndCheck({
			reqUser: req.user,
			monthId,
			dayNumber,
			environment,
			targetUserId,
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

		// Extract day-of-month in Pacific Time
		const parts = new Intl.DateTimeFormat("en-US", {
			timeZone: APP_TZ,
			day: "numeric",
		})
			.formatToParts(new Date())
			.find((p) => p.type === "day");
		const dayNumber = parts
			? parseInt(parts.value, 10)
			: new Date().getDate();

		const out = await createOrUpdateDayAndCheck({
			reqUser: req.user,
			monthId,
			dayNumber,
			environment,
			targetUserId: userId,
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
