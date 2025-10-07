// backend/routes/equipment.js  (DROP-IN)
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const Equipment = require("../models/Equipment");

// All routes admin-only; all data scoped by req.user.adminUser

// LIST all equipment for this admin
router.get("/", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const items = await Equipment.find({ adminUser: req.user.adminUser })
			.sort({ part: 1, createdAt: -1 })
			.lean();
		res.json(items);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

// CREATE equipment row
router.post("/", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const {
			part,
			quantity = 1,
			checkbox = false,
			notes = "",
		} = req.body || {};
		if (!part || typeof part !== "string")
			return res.status(400).json({ msg: "part is required" });

		const doc = await Equipment.create({
			adminUser: req.user.adminUser,
			part: part.trim(),
			quantity,
			checkbox,
			notes,
		});
		res.status(201).json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

// UPDATE equipment row
router.patch("/:id", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await Equipment.findById(id);
		if (!doc) return res.status(404).json({ msg: "Not found" });
		if (String(doc.adminUser) !== String(req.user.adminUser))
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });

		["part", "quantity", "checkbox", "notes"].forEach((f) => {
			if (typeof req.body[f] !== "undefined") doc[f] = req.body[f];
		});
		await doc.save();
		res.json(doc);
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

// DELETE equipment row
router.delete("/:id", auth, async (req, res) => {
	try {
		if (req.user.role !== "admin")
			return res.status(403).json({ msg: "Admin only" });
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const doc = await Equipment.findById(id);
		if (!doc) return res.status(404).json({ msg: "Not found" });
		if (String(doc.adminUser) !== String(req.user.adminUser))
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });

		await Equipment.deleteOne({ _id: id });
		res.json({ deleted: true });
	} catch (e) {
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
