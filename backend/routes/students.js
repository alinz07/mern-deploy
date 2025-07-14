// server/routes/auth.js
const express = require("express");
const router = express.Router();
const Student = require("../models/Student");

// Get All Students
router.get("/", async (req, res) => {
	console.log("GET /api/students called");
	try {
		const students = await Student.find(); // Returns [] if empty
		res.json(students);
	} catch (err) {
		console.error("Error fetching students:", err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
