const express = require("express");
const router = express.Router();
const Student = require("../models/Student"); // Adjust path if needed

// GET /api/students
router.get("/", async (req, res) => {
	try {
		console.log("GET /api/students called");
		const students = await Student.find(); // Fetch all student records
		res.json(students); // Return array (could be empty)
	} catch (err) {
		console.error("Error fetching students:", err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
