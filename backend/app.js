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
app.use("/api/stats", statsRoutes);
app.use("/api/equipment-checks", require("./routes/equipmentChecks"));
app.use("/api/equipment", require("./routes/equipment"));
app.use("/api/comments", require("./routes/comments"));
app.use("/api/equip-comments", require("./routes/equipComments"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/user-equipment", require("./routes/userEquipment"));

// route
app.get("/", async (req, res) => {
	res.status(201).json({ message: "Connected to Backend!" });
});
