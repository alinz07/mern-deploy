const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth");
const studentRoutes = require("./routes/students");
const userRoutes = require("./routes/users");

require("dotenv").config();

//Execute express
const app = express();

//middleware
const corsOptions = {
	origin: "https://mern-deploy-1-hixt.onrender.com", // frontend URI (ReactJS)
};
app.use(express.json());
app.use(cors(corsOptions));

app.get("/ping", (req, res) => res.send("pong"));

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
app.use("/api/users", userRoutes); // 🔹 User routes mounted
console.log("✅ /api/users routes mounted");

app.use((req, res) => {
	console.warn("⚠️ 404 Not Found:", req.originalUrl);
	res.status(404).json({ msg: "Not Found" });
});

// Diagnostic: Log all mounted routes
function listRoutes(app) {
	console.log("🔍 Registered Routes:");
	app._router.stack
		.filter((r) => r.route) // Only routes, skip middleware
		.forEach((r) => {
			const methods = Object.keys(r.route.methods)
				.map((m) => m.toUpperCase())
				.join(", ");
			console.log(`${methods} ${r.route.path}`);
		});
}

listRoutes(app);

// route
app.get("/", async (req, res) => {
	res.status(201).json({ message: "Connected to Backend!" });
});
