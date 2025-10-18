// backend/models/UserEquipment.js
const mongoose = require("mongoose");

const UserEquipmentSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		part: {
			type: String,
			required: true,
			trim: true,
			maxlength: 120,
			index: true,
		},
		quantity: { type: Number, default: 1, min: 0 },
		checkbox: { type: Boolean, default: false },
		notes: { type: String, trim: true, maxlength: 2000 },
	},
	{ timestamps: true }
);

// one row per (user, part)
UserEquipmentSchema.index({ user: 1, part: 1 }, { unique: true });

module.exports = mongoose.model("UserEquipment", UserEquipmentSchema);
