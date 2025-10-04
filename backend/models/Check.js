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

		// 10 booleans
		checkone: { type: Boolean, default: false },
		checktwo: { type: Boolean, default: false },
		checkthree: { type: Boolean, default: false },
		checkfour: { type: Boolean, default: false },
		checkfive: { type: Boolean, default: false },
		checksix: { type: Boolean, default: false },
		checkseven: { type: Boolean, default: false },
		checkeight: { type: Boolean, default: false },
		checknine: { type: Boolean, default: false },
		checkten: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

// one Check per (day,user)
CheckSchema.index({ day: 1, user: 1 }, { unique: true });
// helpful secondaries
CheckSchema.index({ user: 1 });
CheckSchema.index({ day: 1 });

module.exports = mongoose.model("Check", CheckSchema);
