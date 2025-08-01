const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");

const Todo = require("./models/Todo");
require("dotenv").config();

//Execute express
const app = express();
const router = express.Router();

//middleware
const corsOptions = {
	origin: "https://mern-deploy-1-hixt.onrender.com", // frontend URI (ReactJS)
};
app.use(express.json());
app.use(cors(corsOptions));

// connect MongoDB
mongoose
	.connect(process.env.MONGODB_URI)
	.then(() => {
		const PORT = process.env.PORT || 8000;
		app.listen(PORT, () => {
			console.log(`App is Listening on PORT ${PORT}`);
		});
	})
	.catch((err) => {
		console.log(err);
	});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);

// route
app.get("/", async (req, res) => {
	res.status(201).json({ message: "Connected to Backend!" });
});

app.get("/todo", async (req, res) => {
	console.log("todo endpoint called");
	const todos = await Todo.find();
	res.json(todos);
});

app.post("/new", async (req, res) => {
	const newTask = await Todo.create(req.body);
	res.status(201).json({ newTask });
});

app.delete("/delete/:id", async (req, res) => {
	const result = await Todo.findByIdAndDelete(req.params.id);
	res.json(result);
});
