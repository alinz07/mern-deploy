const mongoose = require("mongoose");

const VALID_FIELDS = ["left", "right", "both", "fmMic"];

const EquipCommentSchema = new mongoose.Schema(
	{
		equipmentCheck: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "EquipmentCheck",
			required: true,
			index: true,
		},
		day: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Day",
			required: true,
			index: true,
		},
		month: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Month",
			required: true,
			index: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},

		field: { type: String, enum: VALID_FIELDS, required: true }, // which equipment box

		commentText: {
			type: String,
			required: true,
			trim: true,
			maxlength: 5000,
		},
	},
	{ timestamps: true }
);

// one comment per (equipmentCheck, field)
EquipCommentSchema.index({ equipmentCheck: 1, field: 1 }, { unique: true });

module.exports = mongoose.model("EquipComment", EquipCommentSchema);
