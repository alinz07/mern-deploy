const mongoose = require("mongoose");

const MonthSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
	},
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
});

module.exports = mongoose.model("Month", MonthSchema);
