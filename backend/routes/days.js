const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const isAdmin = require("../utils/isAdmin");
const Day = require("../models/Day");

// GET /api/days?monthId=...
router.get("/", auth, async (req, res) => {
	try {
		const { monthId } = req.query;
		if (!monthId)
			return res.status(400).json({ msg: "monthId is required" });

		const q = { month: monthId };
		if (!isAdmin(req)) q.userId = req.user.id;

		const days = await Day.find(q).sort({ dayNumber: 1 });
		return res.json(days);
	} catch (e) {
		res.status(500).json({ msg: "Server error", error: e.message });
	}
});

module.exports = router;
