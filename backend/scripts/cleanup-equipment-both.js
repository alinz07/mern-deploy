// backend/scripts/cleanup-equipment-both.js
/**
 * Cleanup obsolete equipment "both" data.
 *
 * Dry run:
 *   node backend/scripts/cleanup-equipment-both.js
 *
 * Write changes:
 *   node backend/scripts/cleanup-equipment-both.js --write
 *
 * This unsets EquipmentCheck.both and deletes EquipComment documents whose
 * field is "both". Stats now derive "Both" from left=false and right=false.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const EquipmentCheck = require(path.join(
	__dirname,
	"..",
	"models",
	"EquipmentCheck",
));
const EquipComment = require(path.join(
	__dirname,
	"..",
	"models",
	"EquipComment",
));

const WRITE = process.argv.includes("--write");
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
	console.error("Missing MONGO_URI or MONGODB_URI in backend/.env");
	process.exit(1);
}

(async function run() {
	const t0 = Date.now();
	await mongoose.connect(MONGO_URI, { autoIndex: false });

	try {
		const checksWithBoth =
			await EquipmentCheck.collection.countDocuments({
				both: { $exists: true },
			});
		const commentsForBoth = await EquipComment.countDocuments({
			field: "both",
		});

		console.log(`EquipmentCheck docs with both field: ${checksWithBoth}`);
		console.log(`EquipComment docs for both field: ${commentsForBoth}`);

		if (!WRITE) {
			console.log("Dry run only. Re-run with --write to apply cleanup.");
			return;
		}

		const unsetResult = await EquipmentCheck.collection.updateMany(
			{ both: { $exists: true } },
			{ $unset: { both: "" } },
		);
		const deleteResult = await EquipComment.deleteMany({ field: "both" });

		console.log(
			`Unset both on ${unsetResult.modifiedCount || 0} EquipmentCheck docs.`,
		);
		console.log(
			`Deleted ${deleteResult.deletedCount || 0} both EquipComment docs.`,
		);
	} catch (err) {
		console.error("Cleanup failed:", err);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
		console.log(`Disconnected. Took ${Date.now() - t0} ms.`);
	}
})();
