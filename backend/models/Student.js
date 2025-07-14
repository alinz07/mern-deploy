const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
	studentname: {
		type: String,
		required: true,
	},
});

module.exports = mongoose.model("Student", StudentSchema);
