// server/index.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const authRoutes = require("./routes/auth");

const app = express();

app.use(express.json());
app.use(cors());

mongoose
	.connect(process.env.MONGODB_URI)
	.then(() => console.log("MongoDB Connected"))
	.catch((err) => console.error(err));

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
