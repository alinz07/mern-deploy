// backend/models/AdminUser.js
const mongoose = require("mongoose");

const AdminUserSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true, maxlength: 100 },
		// Code that child users type at registration. Must be unique across all admins.
		joinCode: { type: String, required: true, unique: true, trim: true },
		// The User document that owns this admin org (the admin account)
		ownerUser: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
			index: true,
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model("AdminUser", AdminUserSchema);
