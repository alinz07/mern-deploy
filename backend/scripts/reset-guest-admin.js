/**
 * Remove all shared guest activity and restore the three fictional students.
 * Requires GUEST_STUDENT_PASSWORD. Use --write to confirm destructive reset.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const AdminUser = require("../models/AdminUser");
const User = require("../models/User");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check");
const Comment = require("../models/Comment");
const Equipment = require("../models/Equipment");
const EquipmentCheck = require("../models/EquipmentCheck");
const EquipComment = require("../models/EquipComment");
const Recording = require("../models/Recording");
const UserEquipment = require("../models/UserEquipment");
const {
	guestConfig,
	createDemoStudents,
} = require("./guest-demo-config");

const WRITE = process.argv.includes("--write");
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
	console.error("Missing MONGO_URI or MONGODB_URI in backend/.env");
	process.exit(1);
}

(async function run() {
	await mongoose.connect(MONGO_URI, { autoIndex: false });

	try {
		const config = guestConfig();
		if (!config.studentPassword) {
			throw new Error(
				"Set GUEST_STUDENT_PASSWORD before running this script.",
			);
		}
		const admin = await User.findOne({ username: config.adminUsername }).lean();
		if (!admin || admin.role !== "admin") {
			throw new Error("Configured guest admin was not found.");
		}

		const org = await AdminUser.findOne({ ownerUser: admin._id });
		if (!org || org.accountType !== "guest") {
			throw new Error("Refusing to reset an organization that is not guest.");
		}

		const students = await User.find({
			adminUser: org._id,
			role: "user",
		})
			.select("_id")
			.lean();
		const studentIds = students.map((student) => student._id);
		const recordings = await Recording.find({ user: { $in: studentIds } })
			.select("audioFileId")
			.lean();
		const audioFileIds = recordings
			.map((recording) => recording.audioFileId)
			.filter(Boolean);

		console.log(
			`Guest reset will remove ${studentIds.length} student account(s) and their activity.`,
		);
		if (!WRITE) {
			console.log("Dry run only. Re-run with --write to reset the guest tenant.");
			return;
		}

		await Promise.all([
			Comment.deleteMany({ user: { $in: studentIds } }),
			EquipComment.deleteMany({ user: { $in: studentIds } }),
			EquipmentCheck.deleteMany({ user: { $in: studentIds } }),
			Recording.deleteMany({ user: { $in: studentIds } }),
			Check.deleteMany({ user: { $in: studentIds } }),
			Day.deleteMany({ userId: { $in: studentIds } }),
			Month.deleteMany({ adminUser: org._id }),
			UserEquipment.deleteMany({ user: { $in: studentIds } }),
			Equipment.deleteMany({ adminUser: org._id }),
		]);

		if (audioFileIds.length) {
			const db = mongoose.connection.db;
			await Promise.all([
				db.collection("fs.files").deleteMany({ _id: { $in: audioFileIds } }),
				db.collection("fs.chunks").deleteMany({
					files_id: { $in: audioFileIds },
				}),
			]);
		}

		await User.deleteMany({ _id: { $in: studentIds } });
		await createDemoStudents(
			org._id,
			config.students,
			config.studentPassword,
		);
		org.studentLimit = 3;
		org.studentCount = 3;
		await org.save();

		console.log("Guest tenant reset complete. Restored 3 fictional students.");
	} catch (err) {
		console.error("Guest reset failed:", err);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
})();
