// backend/models/User.js
const mongoose = require("mongoose");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const UserSchema = new mongoose.Schema(
	{
		username: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 50,
			unique: true, // unique username
		},
		password: {
			type: String,
			required: true,
			minlength: 6,
		},
		email: {
			type: String,
			required: true, // NOW required
			trim: true,
			lowercase: true,
			unique: true, // plain unique (no partial needed)
			validate: {
				validator: (v) => EMAIL_REGEX.test(v),
				message: "Invalid email address",
			},
		},
		role: {
			type: String,
			enum: ["admin", "user"],
			default: "user",
			index: true,
		},
		adminUser: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "AdminUser",
			index: true,
		},
	},
	{ timestamps: true }
);

/** Normalize inputs */
UserSchema.pre("save", function (next) {
	if (this.isModified("username") && typeof this.username === "string") {
		this.username = this.username.trim();
	}
	if (this.isModified("email") && typeof this.email === "string") {
		this.email = this.email.trim().toLowerCase();
	}
	next();
});

UserSchema.pre(
	["findOneAndUpdate", "updateOne", "updateMany"],
	function (next) {
		const update = this.getUpdate() || {};
		const $set = update.$set || update;

		if ($set.username && typeof $set.username === "string") {
			$set.username = $set.username.trim();
		}
		if ($set.email && typeof $set.email === "string") {
			$set.email = $set.email.trim().toLowerCase();
		}

		if (update.$set) update.$set = $set;
		else this.setUpdate($set);

		next();
	}
);

// NOTE: Do NOT keep a schema-level partial index on email anymore.

module.exports = mongoose.model("User", UserSchema);
