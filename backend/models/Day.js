const mongoose = require("mongoose");

const DaySchema = new mongoose.Schema(
	{
		monthId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Month",
			required: true,
			index: true,
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
		// Store the calendar day number (1..31)
		day: {
			type: Number,
			required: true,
			min: 1,
			max: 31,
		},
		// Optional: a full ISO date string if you want (e.g. "2025-08-17")
		isoDate: {
			type: String,
			required: false,
		},
		notes: {
			type: String,
			required: false,
			default: "",
		},
	},
	{ timestamps: true }
);

// Prevent duplicate (monthId, day)
DaySchema.index({ monthId: 1, day: 1 }, { unique: true });

module.exports = mongoose.model("Day", DaySchema);
