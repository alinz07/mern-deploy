// server/index.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");

const app = express();

app.use(express.json());
app.use(cors());

console.log("index.js running");

mongoose
	.connect(process.env.MONGODB_URI)
	.then(() => console.log("MongoDB Connected"))
	.catch((err) => console.error(err));

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.get("/ping", (req, res) => {
	res.send("pong");
});

const PORT = process.env.PORT || 5000;
console.log("Server started and listening");

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
