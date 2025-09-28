const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const isAdmin = require("../utils/isAdmin");
const Day = require("../models/Day");
const Month = require("../models/Month");

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

module.exports = router;
