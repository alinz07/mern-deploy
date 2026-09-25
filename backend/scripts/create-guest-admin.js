/**
 * Create or repair the shared guest tenant and its three fictional students.
 * Requires GUEST_ADMIN_PASSWORD and GUEST_STUDENT_PASSWORD.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const AdminUser = require("../models/AdminUser");
const User = require("../models/User");
const { generateJoinCode } = require("../utils/joinCode");
const {
	guestConfig,
	requireGuestPasswords,
	createDemoStudents,
} = require("./guest-demo-config");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
	console.error("Missing MONGO_URI or MONGODB_URI in backend/.env");
	process.exit(1);
}

(async function run() {
	await mongoose.connect(MONGO_URI, { autoIndex: false });

	try {
		const config = guestConfig();
		requireGuestPasswords(config);

		let admin = await User.findOne({
			$or: [
				{ username: config.adminUsername },
				{ email: config.adminEmail },
			],
		});
		if (admin && admin.role !== "admin") {
			throw new Error("The configured guest admin identity belongs to a student.");
		}

		const passwordHash = await bcrypt.hash(config.adminPassword, 10);
		if (!admin) {
			admin = await User.create({
				username: config.adminUsername,
				email: config.adminEmail,
				password: passwordHash,
				role: "admin",
			});
		} else {
			admin.username = config.adminUsername;
			admin.email = config.adminEmail;
			admin.password = passwordHash;
			await admin.save();
		}

		let org = await AdminUser.findOne({ ownerUser: admin._id });
		if (org && org.accountType !== "guest") {
			throw new Error("Refusing to convert an existing standard tenant to guest.");
		}
		if (!org) {
			org = await AdminUser.create({
				name: config.adminName,
				joinCode: generateJoinCode(),
				ownerUser: admin._id,
				accountType: "guest",
				studentLimit: 3,
				studentCount: 0,
			});
		}

		org.name = config.adminName;
		org.accountType = "guest";
		org.studentLimit = 3;
		admin.adminUser = org._id;
		await admin.save();

		await createDemoStudents(
			org._id,
			config.students,
			config.studentPassword,
		);
		org.studentCount = await User.countDocuments({
			adminUser: org._id,
			role: "user",
		});
		await org.save();

		console.log(`Guest admin ready: ${config.adminUsername}`);
		console.log(`Join code: ${org.joinCode}`);
		console.log(`Students: ${org.studentCount}/${org.studentLimit}`);
	} catch (err) {
		console.error("Guest admin creation failed:", err);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
})();
