// models/Comment.js
const mongoose = require("mongoose");

const VALID_FIELDS = [
	"checkone",
	"checktwo",
	"checkthree",
	"checkfour",
	"checkfive",
	"checksix",
	"checkseven",
	"checkeight",
	"checknine",
	"checkten",
];

const CommentSchema = new mongoose.Schema(
	{
		check: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Check",
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

		// NEW: which checkbox this comment is for
		field: { type: String, enum: VALID_FIELDS, required: true },

		commentText: {
			type: String,
			required: true,
			trim: true,
			maxlength: 5000,
		},
	},
	{ timestamps: true }
);

// one comment per (check, field)
CommentSchema.index({ check: 1, field: 1 }, { unique: true });

// helpful lookup if you need it later
CommentSchema.index({ user: 1, month: 1, day: 1, field: 1 });

module.exports = mongoose.model("Comment", CommentSchema);
