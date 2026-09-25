/**
 * Backfill account type, student limits, and current student counts.
 *
 * Dry run:
 *   node backend/scripts/backfill-admin-capacity.js
 *
 * Write changes:
 *   node backend/scripts/backfill-admin-capacity.js --write
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const AdminUser = require("../models/AdminUser");
const User = require("../models/User");

const WRITE = process.argv.includes("--write");
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
	console.error("Missing MONGO_URI or MONGODB_URI in backend/.env");
	process.exit(1);
}

(async function run() {
	await mongoose.connect(MONGO_URI, { autoIndex: false });

	try {
		const orgs = await AdminUser.find({}).lean();
		const updates = [];

		for (const org of orgs) {
			const studentCount = await User.countDocuments({
				adminUser: org._id,
				role: "user",
			});
			const accountType = org.accountType || "standard";
			const studentLimit =
				typeof org.studentLimit === "number"
					? org.studentLimit
					: accountType === "guest"
						? 3
						: 30;

			updates.push({
				updateOne: {
					filter: { _id: org._id },
					update: {
						$set: { accountType, studentLimit, studentCount },
					},
				},
			});
			console.log(
				`${org.name}: ${studentCount}/${studentLimit} students (${accountType})`,
			);
		}

		if (!WRITE) {
			console.log("Dry run only. Re-run with --write to apply the backfill.");
			return;
		}

		if (updates.length) await AdminUser.bulkWrite(updates);
		console.log(`Backfilled ${updates.length} admin organization(s).`);
	} catch (err) {
		console.error("Capacity backfill failed:", err);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
})();
