// models/Check.js
const mongoose = require("mongoose");

const CheckSchema = new mongoose.Schema(
	{
		day: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Day",
			required: true,
			index: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		checkone: { type: Boolean, default: false },
		checktwo: { type: Boolean, default: false },
		checkthree: { type: Boolean, default: false },
		checkfour: { type: Boolean, default: false },
		checkfive: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

// Enforce one Check per (day, user)
CheckSchema.index({ day: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("Check", CheckSchema);
