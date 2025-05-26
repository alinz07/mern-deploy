const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Todo = require("./models/Todo");
require("dotenv").config();

//Execute express
const app = express();

middleware;
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

// route
app.get("/", async (req, res) => {
	res.status(201).json({ message: "Connected to Backend!" });
});

app.get("/todo", async (req, res) => {
	const todos = await Todo.find();
	res.json(todos);
});

app.post("/todo/new", async (req, res) => {
	const newTask = await Todo.create(req.body);
	res.status(201).json({ newTask });
});

app.delete("/todo/delete/:id", async (req, res) => {
	const result = await Todo.findByIdAndDelete(req.params.id);
	res.json(result);
});
