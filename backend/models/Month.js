// models/Month.js
const mongoose = require("mongoose");

const MonthSchema = new mongoose.Schema(
	{
		name: { type: String, required: true }, // e.g. "October 2025"
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		adminUser: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "AdminUser",
			required: true,
			index: true,
		},
	},
	{ timestamps: true }
);

// Exactly one "Month YYYY" per user
MonthSchema.index({ userId: 1, name: 1 }, { unique: true });
// Helpful for admin scoping and lookups
MonthSchema.index({ adminUser: 1, name: 1 });

module.exports = mongoose.model("Month", MonthSchema);
