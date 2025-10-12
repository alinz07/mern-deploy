// backend/scripts/backfill-checks.js
/**
 * Backfill: create a Check for each Day missing one.
 *
 * Usage:
 *   DRY RUN: node backend/scripts/backfill-checks.js --dry-run
 *   WRITE:   node backend/scripts/backfill-checks.js
 *
 * Env (in backend/.env):
 *   MONGO_URI=...           # preferred (matches migrate_v2.js)
 *   # or
 *   MONGODB_URI=...         # also supported (matches migrate-tenant.js)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");

// Models (relative to backend/models)
const Day = require(path.join(__dirname, "..", "models", "Day"));
const Check = require(path.join(__dirname, "..", "models", "Check"));

// Config
const DRY = process.argv.includes("--dry-run");
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
	console.error("❌ Missing MONGO_URI (or MONGODB_URI) in backend/.env");
	process.exit(1);
}

const CHECK_FIELDS = [
	"checkone",
	"checktwo",
	"checkthree",
	"checkfour",
	"checkfive",
	"checksix",
	"checkseven",
	"checkeight",
	"checknine",
	"checkten",
];

const DEFAULT_FIELDS = CHECK_FIELDS.reduce((acc, k) => {
	acc[k] = false;
	return acc;
}, {});

(async function run() {
	const t0 = Date.now();
	console.log("⏳ Connecting to Mongo...");
	await mongoose.connect(MONGO_URI, { autoIndex: false });

	try {
		console.log("✅ Connected. Scanning for Days without Checks…");

		// Days that already have checks
		const daysWithChecks = new Set(
			(await Check.distinct("day")).map((id) => String(id))
		);

		const cursor = Day.find({}, { _id: 1, userId: 1 }).lean().cursor();

		let scanned = 0;
		let toCreate = 0;
		const ops = [];

		for (
			let doc = await cursor.next();
			doc != null;
			doc = await cursor.next()
		) {
			scanned++;
			const dayId = String(doc._id);
			const userId = doc.userId;
			if (!userId) continue;

			if (!daysWithChecks.has(dayId)) {
				toCreate++;
				ops.push({
					updateOne: {
						filter: { day: doc._id, user: userId },
						update: {
							$setOnInsert: {
								day: doc._id,
								user: userId,
								...DEFAULT_FIELDS,
							},
						},
						upsert: true,
					},
				});

				if (ops.length >= 1000) {
					if (DRY) {
						console.log(
							`📝 DRY RUN: would write ${ops.length} checks (batch)`
						);
					} else {
						await Check.bulkWrite(ops, { ordered: false });
					}
					ops.length = 0;
				}
			}
		}

		if (ops.length > 0) {
			if (DRY) {
				console.log(
					`📝 DRY RUN: would write ${ops.length} checks (final batch)`
				);
			} else {
				await Check.bulkWrite(ops, { ordered: false });
			}
		}

		console.log(
			`${
				DRY ? "🧪 DRY RUN complete" : "✅ Backfill complete"
			} — scanned ${scanned} Days; ${toCreate} missing Checks ${
				DRY ? "(not written)" : "created/ensured"
			}`
		);
	} catch (err) {
		console.error("❌ Error during backfill:", err);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
		console.log(`🔌 Disconnected. Took ${Date.now() - t0} ms.`);
	}
})();
