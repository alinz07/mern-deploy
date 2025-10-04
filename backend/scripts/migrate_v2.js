/* scripts/migrate_v2.js
 * One-time migration:
 * - backfill Day.environment, Check.checksix..checkten
 * - deduplicate Months, Days, Checks (and relink children)
 * - create indexes
 *
 * Usage:
 *   DRY_RUN=1 node scripts/migrate_v2.js      # preview
 *   node scripts/migrate_v2.js                # execute
 */

require("dotenv").config();
const mongoose = require("mongoose");

const DRY = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

const connect = async () => {
	const uri = process.env.MONGO_URI;
	if (!uri) {
		console.error("Missing MONGO_URI env var");
		process.exit(1);
	}
	await mongoose.connect(uri, { autoIndex: false });
};

const User = require("../models/User");
const Month = require("../models/Month");
const Day = require("../models/Day");
const Check = require("../models/Check");
let Equipment, EquipmentCheck, Comment;
try {
	Equipment = require("../models/Equipment");
} catch {}
try {
	EquipmentCheck = require("../models/EquipmentCheck");
} catch {}
try {
	Comment = require("../models/Comment");
} catch {}

const idStr = (x) => String(x);

async function backfillFields() {
	console.log("\n[1] Backfilling fields…");

	// Day.environment
	const q1 = {
		$or: [{ environment: { $exists: false } }, { environment: null }],
	};
	const n1 = await Day.countDocuments(q1);
	console.log(` - Day.environment missing: ${n1}`);
	if (!DRY && n1) {
		const r1 = await Day.updateMany(q1, {
			$set: { environment: "online" },
		});
		console.log(`   -> updated: ${r1.modifiedCount}`);
	}

	// Check.checksix..checkten
	const missing = (f) => ({
		$or: [{ [f]: { $exists: false } }, { [f]: null }],
	});
	const q2 = {
		$or: [
			"checksix",
			"checkseven",
			"checkeight",
			"checknine",
			"checkten",
		].map(missing),
	};
	const n2 = await Check.countDocuments(q2);
	console.log(` - Check (6..10) missing: ${n2}`);
	if (!DRY && n2) {
		const r2 = await Check.updateMany(q2, {
			$set: {
				checksix: false,
				checkseven: false,
				checkeight: false,
				checknine: false,
				checkten: false,
			},
		});
		console.log(`   -> updated: ${r2.modifiedCount}`);
	}
}

async function dedupeMonths() {
	console.log("\n[2] Deduplicating Months by (userId, name)…");
	const pipeline = [
		{
			$group: {
				_id: { userId: "$userId", name: "$name" },
				ids: { $addToSet: "$_id" },
				count: { $sum: 1 },
				first: { $first: "$_id" },
			},
		},
		{ $match: { count: { $gt: 1 } } },
	];
	const dupGroups = await Month.aggregate(pipeline);
	console.log(` - duplicate groups: ${dupGroups.length}`);
	for (const g of dupGroups) {
		const ids = g.ids.map(idStr);
		// Choose oldest to keep (first in natural order usually oldest; make it deterministic)
		const months = await Month.find({ _id: { $in: ids } })
			.sort({ createdAt: 1 })
			.lean();
		const keep = months[0];
		const remove = months.slice(1);

		console.log(
			`   -> Keeping Month ${keep._id} (${g._id.name}) for user ${g._id.userId}, removing ${remove.length}`
		);
		if (DRY) continue;

		const removeIds = remove.map((m) => m._id);

		// Relink children to kept month
		const updates = [];
		updates.push(
			Day.updateMany(
				{ month: { $in: removeIds } },
				{ $set: { month: keep._id } }
			)
		);
		if (EquipmentCheck)
			updates.push(
				EquipmentCheck.updateMany(
					{ month: { $in: removeIds } },
					{ $set: { month: keep._id } }
				)
			);
		if (Comment)
			updates.push(
				Comment.updateMany(
					{ month: { $in: removeIds } },
					{ $set: { month: keep._id } }
				)
			);

		const ures = await Promise.all(updates);
		console.log(
			`     relinked children (Day/EquipmentCheck/Comment):`,
			ures.map((u) => u.modifiedCount || 0)
		);

		const dres = await Month.deleteMany({ _id: { $in: removeIds } });
		console.log(`     deleted extra months: ${dres.deletedCount}`);
	}
}

async function dedupeDays() {
	console.log("\n[3] Deduplicating Days by (month, userId, dayNumber)…");
	const pipeline = [
		{
			$group: {
				_id: {
					month: "$month",
					userId: "$userId",
					dayNumber: "$dayNumber",
				},
				ids: { $addToSet: "$_id" },
				count: { $sum: 1 },
			},
		},
		{ $match: { count: { $gt: 1 } } },
	];
	const dupGroups = await Day.aggregate(pipeline);
	console.log(` - duplicate groups: ${dupGroups.length}`);
	for (const g of dupGroups) {
		const days = await Day.find({ _id: { $in: g.ids } })
			.sort({ createdAt: 1 })
			.lean();
		const keep = days[0];
		const remove = days.slice(1);
		const removeIds = remove.map((d) => d._id);

		console.log(
			`   -> Keeping Day ${keep._id} (m=${idStr(keep.month)} u=${idStr(
				keep.userId
			)} d=${keep.dayNumber}), removing ${removeIds.length}`
		);
		if (DRY) continue;

		// Relink children to kept day
		const updates = [];
		updates.push(
			Check.updateMany(
				{ day: { $in: removeIds } },
				{ $set: { day: keep._id } }
			)
		);
		if (EquipmentCheck)
			updates.push(
				EquipmentCheck.updateMany(
					{ day: { $in: removeIds } },
					{ $set: { day: keep._id } }
				)
			);
		if (Comment)
			updates.push(
				Comment.updateMany(
					{ day: { $in: removeIds } },
					{ $set: { day: keep._id } }
				)
			);
		const ures = await Promise.all(updates);
		console.log(
			`     relinked children (Check/EquipmentCheck/Comment):`,
			ures.map((u) => u.modifiedCount || 0)
		);

		const dres = await Day.deleteMany({ _id: { $in: removeIds } });
		console.log(`     deleted extra days: ${dres.deletedCount}`);
	}
}

function orBooleans(a, b) {
	const keys = [
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
	const out = {};
	for (const k of keys) out[k] = Boolean(a[k]) || Boolean(b[k]);
	return out;
}

async function dedupeChecks() {
	console.log("\n[4] Deduplicating Checks by (day, user)…");
	const pipeline = [
		{
			$group: {
				_id: { day: "$day", user: "$user" },
				ids: { $addToSet: "$_id" },
				count: { $sum: 1 },
			},
		},
		{ $match: { count: { $gt: 1 } } },
	];
	const dupGroups = await Check.aggregate(pipeline);
	console.log(` - duplicate groups: ${dupGroups.length}`);
	for (const g of dupGroups) {
		const checks = await Check.find({ _id: { $in: g.ids } })
			.sort({ createdAt: 1 })
			.lean();
		const keep = checks[0];
		const remove = checks.slice(1);
		const removeIds = remove.map((c) => c._id);

		// Merge boolean fields (OR)
		let merged = { ...keep };
		for (const r of remove)
			merged = { ...merged, ...orBooleans(merged, r) };

		console.log(
			`   -> Keeping Check ${keep._id} (day=${idStr(
				keep.day
			)} user=${idStr(keep.user)}), merging ${removeIds.length}`
		);
		if (DRY) continue;

		// Update kept doc with merged booleans
		await Check.updateOne(
			{ _id: keep._id },
			{
				$set: {
					checkone: merged.checkone,
					checktwo: merged.checktwo,
					checkthree: merged.checkthree,
					checkfour: merged.checkfour,
					checkfive: merged.checkfive,
					checksix: merged.checksix,
					checkseven: merged.checkseven,
					checkeight: merged.checkeight,
					checknine: merged.checknine,
					checkten: merged.checkten,
				},
			}
		);

		// Relink Comments pointing to removed checks
		if (Comment && removeIds.length) {
			const cres = await Comment.updateMany(
				{ check: { $in: removeIds } },
				{ $set: { check: keep._id } }
			);
			console.log(`     relinked comments: ${cres.modifiedCount}`);
		}

		// delete removed checks
		const dres = await Check.deleteMany({ _id: { $in: removeIds } });
		console.log(`     deleted extra checks: ${dres.deletedCount}`);
	}
}

async function createIndexes() {
	console.log("\n[5] Creating indexes… (non-fatal if already exist)");

	// Month
	try {
		await Month.collection.createIndex(
			{ userId: 1, name: 1 },
			{ unique: true }
		);
	} catch (e) {
		console.log("  Month (userId,name):", e.codeName || e.message);
	}
	try {
		await Month.collection.createIndex({ adminUser: 1, name: 1 });
	} catch (e) {
		console.log("  Month (adminUser,name):", e.codeName || e.message);
	}

	// Day
	try {
		await Day.collection.createIndex(
			{ month: 1, userId: 1, dayNumber: 1 },
			{ unique: true }
		);
	} catch (e) {
		console.log("  Day (month,userId,dayNumber):", e.codeName || e.message);
	}
	try {
		await Day.collection.createIndex({ month: 1 });
	} catch (e) {
		console.log("  Day (month):", e.codeName || e.message);
	}
	try {
		await Day.collection.createIndex({ userId: 1, month: 1 });
	} catch (e) {
		console.log("  Day (userId,month):", e.codeName || e.message);
	}

	// Check
	try {
		await Check.collection.createIndex(
			{ day: 1, user: 1 },
			{ unique: true }
		);
	} catch (e) {
		console.log("  Check (day,user):", e.codeName || e.message);
	}
	try {
		await Check.collection.createIndex({ day: 1 });
	} catch (e) {
		console.log("  Check (day):", e.codeName || e.message);
	}
	try {
		await Check.collection.createIndex({ user: 1 });
	} catch (e) {
		console.log("  Check (user):", e.codeName || e.message);
	}

	// Optional new models
	if (EquipmentCheck) {
		try {
			await EquipmentCheck.collection.createIndex(
				{ user: 1, month: 1, day: 1 },
				{ unique: true }
			);
		} catch (e) {
			console.log("  EquipmentCheck (u,m,d):", e.codeName || e.message);
		}
		try {
			await EquipmentCheck.collection.createIndex({ user: 1 });
		} catch (e) {
			console.log("  EquipmentCheck (user):", e.codeName || e.message);
		}
	}
	if (Equipment) {
		try {
			await Equipment.collection.createIndex({ user: 1, part: 1 });
		} catch (e) {
			console.log("  Equipment (user,part):", e.codeName || e.message);
		}
	}
	if (Comment) {
		try {
			await Comment.collection.createIndex({ check: 1 });
		} catch (e) {
			console.log("  Comment (check):", e.codeName || e.message);
		}
		try {
			await Comment.collection.createIndex({ user: 1, month: 1, day: 1 });
		} catch (e) {
			console.log("  Comment (u,m,d):", e.codeName || e.message);
		}
	}
}

(async () => {
	const t0 = Date.now();
	try {
		await connect();
		console.log("Connected to MongoDB");

		await backfillFields();
		await dedupeMonths();
		await dedupeDays();
		await dedupeChecks();
		if (!DRY) await createIndexes();

		console.log(
			`\nDONE in ${((Date.now() - t0) / 1000).toFixed(1)}s  (DRY_RUN=${
				DRY ? "yes" : "no"
			})`
		);
		await mongoose.disconnect();
	} catch (e) {
		console.error("Migration failed:", e);
		process.exitCode = 1;
		try {
			await mongoose.disconnect();
		} catch {}
	}
})();
