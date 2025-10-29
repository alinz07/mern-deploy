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
		// GridFS file ids
		teacherFileId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "fs.files",
		},
		studentFileId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "fs.files",
		},

		// transcription + IPA
		teacherText: { type: String },
		teacherIPA: { type: String },
		studentText: { type: String },
		studentIPA: { type: String },

		// book-keeping
		durationTeacherMs: { type: Number },
		durationStudentMs: { type: Number },
	},
	{ timestamps: true }
);

module.exports = mongoose.model("Recording", RecordingSchema);
