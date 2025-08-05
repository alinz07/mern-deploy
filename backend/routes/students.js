const express = require("express");
const router = express.Router();
const Student = require("../models/Student"); // Adjust path if needed
const auth = require("../middleware/auth");

// GET /api/students
router.get("/", auth, async (req, res) => {
	try {
		console.log("GET /api/students called");
		const students = await Student.find(); // Fetch all student records
		res.json(students); // Return array (could be empty)
	} catch (err) {
		console.error("Error fetching students:", err.message);
		res.status(500).send("Server Error");
	}
});

// GET /api/users/:id/data
router.get("/:id/data", auth, async (req, res) => {
	try {
		// Only allow users to see their own data
		if (req.user.id !== req.params.id && req.user.username !== "admin") {
			return res.status(403).json({ msg: "Access denied" });
		}

		const data = await UserData.find({ userId: req.params.id });
		res.json(data);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

// POST /api/students/new
router.post("/new", auth, async (req, res) => {
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
router.delete("/delete/:id", auth, async (req, res) => {
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
