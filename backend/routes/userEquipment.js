// backend/routes/userEquipment.js
const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const UserEquipment = require("../models/UserEquipment");

// All endpoints below are auto-scoped to the logged-in user.
// Admins do NOT see or modify anyone's user-owned equipment here.

router.get("/", auth, async (req, res) => {
	try {
		const rows = await UserEquipment.find({ user: req.user.id })
			.sort({ part: 1 })
			.lean();
		res.json(rows);
	} catch {
		res.status(500).json({ msg: "Server error" });
	}
});

router.post("/", auth, async (req, res) => {
	try {
		const body = {
			user: req.user.id,
			part: (req.body.part || "").trim(),
			quantity: Number.isFinite(+req.body.quantity)
				? +req.body.quantity
				: 1,
			checkbox: !!req.body.checkbox,
			notes: req.body.notes || "",
		};
		if (!body.part)
			return res.status(400).json({ msg: "Part is required" });

		// upsert on (user, part)
		const doc = await UserEquipment.findOneAndUpdate(
			{ user: body.user, part: body.part },
			{ $set: body },
			{ new: true, upsert: true }
		);
		res.json(doc);
	} catch (e) {
		// surface uniqueness errors nicely
		const msg = e?.message?.includes("E11000")
			? "Part already exists"
			: "Server error";
		res.status(400).json({ msg });
	}
});

router.patch("/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const update = {
			...(req.body.part != null
				? { part: String(req.body.part).trim() }
				: {}),
			...(req.body.quantity != null
				? { quantity: +req.body.quantity }
				: {}),
			...(req.body.checkbox != null
				? { checkbox: !!req.body.checkbox }
				: {}),
			...(req.body.notes != null
				? { notes: String(req.body.notes) }
				: {}),
		};

		const doc = await UserEquipment.findOneAndUpdate(
			{ _id: id, user: req.user.id },
			{ $set: update },
			{ new: true }
		);
		if (!doc) return res.status(404).json({ msg: "Not found" });
		res.json(doc);
	} catch {
		res.status(500).json({ msg: "Server error" });
	}
});

router.delete("/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });
		const out = await UserEquipment.deleteOne({
			_id: id,
			user: req.user.id,
		});
		res.json({ deleted: out.deletedCount > 0 });
	} catch {
		res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
