// backend/models/Day.js
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
	},
	{ timestamps: true }
);

DaySchema.index({ month: 1, dayNumber: 1 }, { unique: true }); // one doc per day per month
module.exports = mongoose.model("Day", DaySchema);
