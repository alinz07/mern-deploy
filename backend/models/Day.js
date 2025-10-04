// models/Day.js
const mongoose = require("mongoose");

const DaySchema = new mongoose.Schema(
	{
		dayNumber: { type: Number, min: 1, max: 31, required: true },
		month: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Month",
			required: true,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},

		environment: {
			type: String,
			enum: ["online", "inperson"],
			default: "online",
			index: true,
		},
	},
	{ timestamps: true }
);

// One Day per (month,user,dayNumber)
DaySchema.index({ month: 1, userId: 1, dayNumber: 1 }, { unique: true });
// Common filters
DaySchema.index({ month: 1 });
DaySchema.index({ userId: 1, month: 1 });

module.exports = mongoose.model("Day", DaySchema);
