// models/EquipmentCheck.js
const mongoose = require("mongoose");

const EquipmentCheckSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		month: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Month",
			required: true,
			index: true,
		},
		day: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Day",
			required: true,
			index: true,
		},

		left: { type: Boolean, default: false },
		right: { type: Boolean, default: false },
		both: { type: Boolean, default: false },
		fmMic: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

// one equipment check row per (user,month,day)
EquipmentCheckSchema.index({ user: 1, month: 1, day: 1 }, { unique: true });

module.exports = mongoose.model("EquipmentCheck", EquipmentCheckSchema);
