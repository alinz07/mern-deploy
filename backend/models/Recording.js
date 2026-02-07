// backend/models/Recording.js
const mongoose = require("mongoose");

const RecordingSchema = new mongoose.Schema(
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
		}, // student
		// NEW: which check field this recording belongs to (checkone..checkten)
		field: {
			type: String,
			enum: [
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
			],
			required: true,
			index: true,
		},
		// GridFS file ids
		audioFileId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "fs.files",
		},

		// transcription + IPA
		audioText: { type: String },
		audioIPA: { type: String },

		// book-keeping
		durationAudiotMs: { type: Number },
	},
	{ timestamps: true }
);

// Guarantee 1 per (day, user, field)
RecordingSchema.index({ day: 1, user: 1, field: 1 }, { unique: true });

module.exports = mongoose.model("Recording", RecordingSchema);
