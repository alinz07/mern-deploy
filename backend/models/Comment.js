// models/Comment.js
const mongoose = require("mongoose");

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

		commentText: {
			type: String,
			required: true,
			trim: true,
			maxlength: 5000,
		},
	},
	{ timestamps: true }
);

// fast fan-out: look up comments by check, or by (user,month,day)
CommentSchema.index({ user: 1, month: 1, day: 1 });
module.exports = mongoose.model("Comment", CommentSchema);
