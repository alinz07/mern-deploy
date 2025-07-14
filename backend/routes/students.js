// server/routes/auth.js
const express = require("express");
const router = express.Router();
const config = require("../config");
const Student = require("../models/Student");

// Get All Students
router.get("/", async (req, res) => {
	try {
		const students = await Student.find();

		res.json(students);
	} catch (err) {
		console.error(err.message);
		res.status(500).send("Server Error");
	}
});

module.exports = router;
