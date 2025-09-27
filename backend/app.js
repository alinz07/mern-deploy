const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const monthRoutes = require("./routes/months");
const days = require("./routes/days");
const checkRoutes = require("./routes/checks");

require("dotenv").config();

//Execute express
const app = express();

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
app.use("/api/users", userRoutes); // 🔹 User routes mounted
app.use("/api/months", monthRoutes);
app.use("/api/days", days);
app.use("/api/checks", checkRoutes);

const path = require("path");

// Serve the React build (adjust the path if your build dir differs)
app.use(express.static(path.join(__dirname, "client", "build")));

// History API fallback for React Router (exclude /api/*)
app.get(/^\/(?!api).*/, (req, res) => {
	res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});

app.get("/api/health", (req, res) => {
	res.status(200).json({ ok: true });
});
