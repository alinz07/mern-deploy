const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const monthRoutes = require("./routes/months");
const days = require("./routes/days");
const checkRoutes = require("./routes/checks");
const statsRoutes = require("./routes/stats");

require("dotenv").config();

//Execute express
const app = express();

//middleware
// ✅ Allow both Render frontend + local React dev server
const allowedOrigins = [
	process.env.CLIENT_ORIGIN, // e.g. http://localhost:3000
	"https://mern-deploy-1-hixt.onrender.com",
	"http://localhost:3000",
].filter(Boolean);

app.use(
	cors({
		origin: function (origin, callback) {
			// allow requests with no origin (like curl/postman)
			if (!origin) return callback(null, true);

			if (allowedOrigins.includes(origin)) return callback(null, true);

			return callback(new Error("Not allowed by CORS: " + origin));
		},
	})
);
app.use(express.json());

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
app.use("/api/stats", statsRoutes);
app.use("/api/equipment-checks", require("./routes/equipmentChecks"));
app.use("/api/equipment", require("./routes/equipment"));
app.use("/api/comments", require("./routes/comments"));
app.use("/api/equip-comments", require("./routes/equipComments"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/user-equipment", require("./routes/userEquipment"));
app.use("/api/recordings", require("./routes/recordings"));

// route
app.get("/", async (req, res) => {
	res.status(201).json({ message: "Connected to Backend!" });
});
