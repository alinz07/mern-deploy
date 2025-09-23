// backend/routes/months.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const mongoose = require("mongoose");
const Month = require("../models/Month");
const Day = require("../models/Day");

/**
 * Ensure a month has Day(1..31) for the given user.
 * Sequential upserts; $setOnInsert for { month, dayNumber } + $set for { userId }.
 */
async function ensureDaysForMonth(monthId, userId) {
	let created = 0;
	let existing = 0;

	for (let dayNumber = 1; dayNumber <= 31; dayNumber++) {
		const res = await Day.updateOne(
			{ month: monthId, dayNumber },
			{
				$set: { userId },
				$setOnInsert: { month: monthId, dayNumber },
			},
			{ upsert: true }
		);
		if (res.upsertedId || res.upsertedCount === 1) created++;
		else existing++;
	}

	return { ensured: 31, created, existing };
}

async function getDaysTelemetry(monthId, userId, isAdmin) {
	const q = { month: monthId };
	if (!isAdmin) q.userId = userId;
	const docs = await Day.find(q, { dayNumber: 1, _id: 0 }).lean();
	const have = new Set(docs.map((d) => d.dayNumber));
	const missing = [];
	for (let i = 1; i <= 31; i++) if (!have.has(i)) missing.push(i);
	return { countForViewer: docs.length, missing };
}

// GET all months (admin sees all, others see their own)
router.get("/", auth, async (req, res) => {
	try {
		const filter =
			req.user.username === "admin" ? {} : { userId: req.user.id };
		const months = await Month.find(filter)
			.sort({ name: 1 })
			.populate("userId", "username");
		res.json(months);
	} catch (err) {
		console.error("GET /months error:", err?.message || err);
		res.status(500).send("Server Error");
	}
});

// POST /api/months/new  (idempotent)
router.post("/new", auth, async (req, res) => {
	try {
		const { name } = req.body || {};
		if (!name)
			return res.status(400).json({ msg: "Month name is required" });

		const userId = req.user?.id;
		if (!userId || !mongoose.isValidObjectId(userId)) {
			return res
				.status(401)
				.json({ msg: "Invalid or missing user context" });
		}

		let month = await Month.findOne({ name, userId });
		const isNew = !month;
		if (!month) month = await Month.create({ name, userId });

		const ensure = await ensureDaysForMonth(month._id, userId);
		const telemetry = await getDaysTelemetry(
			month._id,
			userId,
			req.user.username === "admin"
		);

		return res.status(isNew ? 201 : 200).json({
			...month.toObject(),
			_telemetry: {
				ensured: ensure.ensured,
				created: ensure.created,
				existing: ensure.existing,
				visibleToCaller: telemetry.countForViewer,
				missingForCaller: telemetry.missing, // [] means all 31 are visible to this user
			},
		});
	} catch (e) {
		console.error("POST /months/new failed:", e?.message || e);
		return res
			.status(500)
			.json({ msg: "Server error", error: e?.message || String(e) });
	}
});

// GET a single month by id (owner or admin only)
router.get("/:id", auth, async (req, res) => {
	try {
		const m = await Month.findById(req.params.id);
		if (!m) return res.status(404).json({ msg: "Not found" });
		if (req.user.username !== "admin" && String(m.userId) !== req.user.id) {
			return res.status(403).json({ msg: "Forbidden" });
		}
		res.json(m);
	} catch (e) {
		console.error("GET /months/:id failed:", e?.message || e);
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
