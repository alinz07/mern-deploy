const mongoose = require("mongoose");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const UserSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		trim: true,
		minlength: 3,
		maxlength: 50,
		unique: true,
	},
	password: {
		type: String,
		required: true,
		minlength: 6,
	},
	email: {
		type: String,
		required: true,
		unique: true,
		lowercase: true,
		trim: true,
		validate: {
			validator: (v) => v == null || v === "" || EMAIL_REGEX.test(v),
			message: "Invalid email address",
		},
	},
});

UserSchema.pre("save", function (next) {
	if (this.isModified("username") && typeof this.username === "string") {
		this.username = this.username.trim();
	}
	if (this.isModified("email") && typeof this.email === "string") {
		this.email = this.email.trim().toLowerCase();
		if (this.email === "") this.email = undefined; // treat empty string as unset
	}
	next();
});

// Normalize on update queries (findOneAndUpdate / updateOne / updateMany)
UserSchema.pre(
	["findOneAndUpdate", "updateOne", "updateMany"],
	function (next) {
		const update = this.getUpdate() || {};
		const $set = update.$set || update;

		if ($set.username && typeof $set.username === "string") {
			$set.username = $set.username.trim();
		}
		if ($set.email && typeof $set.email === "string") {
			const trimmed = $set.email.trim().toLowerCase();
			$set.email = trimmed === "" ? undefined : trimmed;
		}

		if (update.$set) update.$set = $set;
		else this.setUpdate($set);

		next();
	}
);

module.exports = mongoose.model("User", UserSchema);
