// routes/checks.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth"); // your existing JWT auth
const Check = require("../models/Check");
const Day = require("../models/Day");
const Month = require("../models/Month");

// helper: assert day belongs to caller's tenant
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

// Ensure a Check exists for (dayId, current user) and return it
router.post("/", auth, async (req, res) => {
	try {
		const { dayId } = req.body;
		if (!dayId || !mongoose.isValidObjectId(dayId))
			return res.status(400).json({ msg: "dayId is required" });

		const checkTenant = await assertSameTenant(dayId, req.user.adminUser);
		if (!checkTenant.ok)
			return res
				.status(checkTenant.status)
				.json({ msg: checkTenant.msg });

		const check = await Check.findOneAndUpdate(
			{ day: dayId, user: req.user.id },
			{ $setOnInsert: { day: dayId, user: req.user.id } },
			{ new: true, upsert: true }
		);
		res.json(check);
	} catch (err) {
		console.error("POST /api/checks error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

// Get checks for a day
router.get("/", auth, async (req, res) => {
	try {
		const { dayId, all } = req.query;
		if (!dayId || !mongoose.isValidObjectId(dayId))
			return res.status(400).json({ msg: "dayId is required" });

		const checkTenant = await assertSameTenant(dayId, req.user.adminUser);
		if (!checkTenant.ok)
			return res
				.status(checkTenant.status)
				.json({ msg: checkTenant.msg });

		const query =
			req.user.role === "admin" && all === "1"
				? { day: dayId }
				: { day: dayId, user: req.user.id };
		const checks = await Check.find(query).lean();
		res.json(checks);
	} catch (err) {
		console.error("GET /api/checks error:", err);
		res.status(500).json({ msg: "Server error" });
	}
});

// Update booleans on a Check
router.patch("/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await Check.findById(id);
		if (!doc) return res.status(404).json({ msg: "Check not found" });

		// tenant guard
		const checkTenant = await assertSameTenant(doc.day, req.user.adminUser);
		if (!checkTenant.ok)
			return res
				.status(checkTenant.status)
				.json({ msg: checkTenant.msg });

		// Owner or admin only
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
