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

// POST /api/students/new
router.post("/new", async (req, res) => {
	try {
		const { studentname } = req.body;

		if (!studentname) {
			return res.status(400).json({ msg: "studentname is required" });
		}

		const newStudent = new Student({ studentname });

		const savedStudent = await newStudent.save();

		res.status(201).json(savedStudent);
	} catch (err) {
		console.error("Error saving student:", err.message);
		res.status(500).send("Server Error");
	}
});

// routes/students.js
router.delete("/delete/:id", async (req, res) => {
	try {
		const student = await Student.findByIdAndDelete(req.params.id);
		if (!student) {
			return res.status(404).json({ msg: "Student not found" });
		}
		res.json({ msg: "Student deleted" });
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
