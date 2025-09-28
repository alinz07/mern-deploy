// backend/models/Month.js
const mongoose = require("mongoose");

const MonthSchema = new mongoose.Schema({
	name: { type: String, required: true },
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	adminUser: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "AdminUser",
		required: true,
		index: true,
	},
});

module.exports = mongoose.model("Month", MonthSchema);
