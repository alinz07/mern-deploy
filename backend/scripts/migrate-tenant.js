// scripts/migrate-tenant.js  (run with `node scripts/migrate-tenant.js`)
const mongoose = require("mongoose");
const User = require("../models/User");
const Month = require("../models/Month");
const AdminUser = require("../models/AdminUser");

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

(async () => {
	await mongoose.connect(process.env.MONGO_URI);

	// Create a single AdminUser for your current “solo admin” world.
	// Pick the actual admin account’s _id:
	const admin = await User.findOne({ username: "admin" });
	if (!admin)
		throw new Error(
			"No 'admin' user found; edit this script to pick an existing admin"
		);

	// If it already exists, skip creating a duplicate
	let au = await AdminUser.findOne({ ownerUser: admin._id });
	if (!au) {
		au = await AdminUser.create({
			name: "Default Admin Org",
			joinCode: "DEFAULT1",
			ownerUser: admin._id,
		});
	}

	// Attach all users to this AdminUser (idempotent)
	await User.updateMany(
		{ adminUser: { $exists: false } },
		{ $set: { adminUser: au._id } }
	);

	// Stamp all months with adminUser (idempotent)
	await Month.updateMany({ adminUser: { $exists: false } }, [
		{
			$set: {
				adminUser: au._id,
			},
		},
	]);

	console.log("Migration complete.");
	await mongoose.disconnect();
})();
