// models/Equipment.js
const mongoose = require("mongoose");

const EquipmentSchema = new mongoose.Schema(
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

// helpful for admin overviews
EquipmentSchema.index({ user: 1, part: 1 });

module.exports = mongoose.model("Equipment", EquipmentSchema);
