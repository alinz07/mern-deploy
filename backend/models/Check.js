// models/Check.js
const mongoose = require("mongoose");

const CheckSchema = new mongoose.Schema(
	{
		day: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Day",
			required: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},

		checkone: { type: Boolean, default: true },
		checktwo: { type: Boolean, default: true },
		checkthree: { type: Boolean, default: true },
		checkfour: { type: Boolean, default: true },
		checkfive: { type: Boolean, default: true },
		checksix: { type: Boolean, default: true },
		checkseven: { type: Boolean, default: true },
		checkeight: { type: Boolean, default: true },
		checknine: { type: Boolean, default: true },
		checkten: { type: Boolean, default: true },
	},
	{ timestamps: true },
);

// one Check per (day,user)
CheckSchema.index({ day: 1, user: 1 }, { unique: true });
// helpful secondaries
CheckSchema.index({ day: 1 });
CheckSchema.index({ user: 1 });

module.exports = mongoose.model("Check", CheckSchema);
