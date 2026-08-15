// backend/routes/recordings.js
const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const auth = require("../middleware/auth");

const Recording = require("../models/Recording");
const Day = require("../models/Day");
const Month = require("../models/Month");
const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const EquipmentCheck = require("../models/EquipmentCheck");
const Check = require("../models/Check");
const Comment = require("../models/Comment");

console.log("[recordings.js] routes module loaded");

// -------------------- background transcription queue --------------------
const TRANSCRIBE_STALE_MS = 30 * 60 * 1000; // 30 minutes
const selfBase = `http://127.0.0.1:${process.env.PORT || 8000}`;

const transcribeQueue = [];
let transcribeWorkerRunning = false;

async function enqueueDayTranscription({ dayId, userId, token }) {
	console.log("[transcribeQueue] enqueue", {
		dayId: String(dayId),
		userId: String(userId),
		hasToken: !!token,
		queueLengthBefore: transcribeQueue.length,
	});
	transcribeQueue.push({ dayId, userId, token });
	runTranscribeWorker().catch((e) =>
		console.error("[transcribeWorker] fatal", e),
	);
}

async function runTranscribeWorker() {
	if (transcribeWorkerRunning) return;
	transcribeWorkerRunning = true;

	try {
		while (transcribeQueue.length) {
			const job = transcribeQueue.shift();
			await processDayTranscriptionJob(job);
		}
	} finally {
		transcribeWorkerRunning = false;
	}
}

async function processDayTranscriptionJob({ dayId, userId, token }) {
	console.log("[transcribeWorker] start job", {
		dayId: String(dayId),
		userId: String(userId),
		hasToken: !!token,
	});

	// mark processing
	await Day.updateOne(
		{ _id: dayId },
		{
			$set: {
				"transcription.status": "processing",
				"transcription.startedAt": new Date(),
				"transcription.error": null,
			},
		},
	);

	try {
		// find recordings for this day/user
		const recs = await Recording.find({ day: dayId, user: userId })
			.select("_id field audioFileId audioText audioIPA")
			.lean();

		const ids = recs.filter((r) => r.audioFileId).map((r) => String(r._id));
		console.log("[transcribeWorker] recordings found", {
			dayId: String(dayId),
			userId: String(userId),
			recordingCount: recs.length,
			withAudioCount: ids.length,
			recordings: recs.map((r) => ({
				id: String(r._id),
				field: r.field,
				hasAudio: !!r.audioFileId,
				hasText: !!r.audioText,
				hasIPA: !!r.audioIPA,
			})),
		});

		// nothing to do
		if (!ids.length) {
			console.log("[transcribeWorker] no audio recordings, marking done", {
				dayId: String(dayId),
				userId: String(userId),
			});
			await Day.updateOne(
				{ _id: dayId },
				{
					$set: {
						"transcription.status": "done",
						"transcription.finishedAt": new Date(),
					},
				},
			);
			return;
		}

		// run sequentially to avoid OOM / spikes
		for (const id of ids) {
			console.log("[transcribeWorker] transcribing recording", { id });
			const resp = await fetch(
				`${selfBase}/api/recordings/${id}/transcribe`,
				{
					method: "POST",
					headers: {
						"x-auth-token": token,
						"x-transcribe-job": "1",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			if (!resp.ok) {
				const txt = await resp.text().catch(() => "");
				console.error("[transcribeWorker] recording failed", {
					id,
					status: resp.status,
					body: txt.slice(0, 1000),
				});
				throw new Error(
					`Transcribe failed (${resp.status}): ${txt.slice(0, 300)}`,
				);
			}

			const body = await resp.json().catch(() => null);
			console.log("[transcribeWorker] recording complete", {
				id,
				hasText: !!body?.audioText,
				hasIPA: !!body?.audioIPA,
				textPreview: body?.audioText ? body.audioText.slice(0, 120) : "",
				ipaPreview: body?.audioIPA ? body.audioIPA.slice(0, 120) : "",
			});
		}

		console.log("[transcribeWorker] job done", {
			dayId: String(dayId),
			userId: String(userId),
			transcribedCount: ids.length,
		});
		await Day.updateOne(
			{ _id: dayId },
			{
				$set: {
					"transcription.status": "done",
					"transcription.finishedAt": new Date(),
				},
			},
		);
	} catch (err) {
		console.error("[transcribeWorker] job error", err);
		await Day.updateOne(
			{ _id: dayId },
			{
				$set: {
					"transcription.status": "error",
					"transcription.error": err?.message
						? String(err.message)
						: String(err),
					"transcription.finishedAt": new Date(),
				},
			},
		);
	}
}

// ---- storage helpers ----
function getBucket() {
	return new GridFSBucket(mongoose.connection.db, { bucketName: "audio" });
}
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 30 * 1024 * 1024 },
}); // 30MB per clip

function isValidField(field) {
	const VALID_FIELDS = new Set([
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
	]);
	return VALID_FIELDS.has(field);
}

const FIELD_LABELS = {
	checkone: "u (oo)",
	checktwo: "a (ah)",
	checkthree: "i (ee)",
	checkfour: "s (s)",
	checkfive: "sh",
	checksix: "m (m)",
	checkseven: "n (n)",
	checkeight: "j",
	checknine: "z (z)",
	checkten: "h (h)",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buf) {
	let crc = 0xffffffff;
	for (const byte of buf) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function zipDateParts(date = new Date()) {
	const time =
		(date.getHours() << 11) |
		(date.getMinutes() << 5) |
		Math.floor(date.getSeconds() / 2);
	const dosDate =
		((date.getFullYear() - 1980) << 9) |
		((date.getMonth() + 1) << 5) |
		date.getDate();
	return { time, dosDate };
}

function buildZip(files) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;
	const { time, dosDate } = zipDateParts();

	for (const file of files) {
		const nameBuf = Buffer.from(file.name, "utf8");
		const dataBuf = Buffer.isBuffer(file.data)
			? file.data
			: Buffer.from(String(file.data), "utf8");
		const crc = crc32(dataBuf);

		const localHeader = Buffer.alloc(30);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0x0800, 6);
		localHeader.writeUInt16LE(0, 8);
		localHeader.writeUInt16LE(time, 10);
		localHeader.writeUInt16LE(dosDate, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(dataBuf.length, 18);
		localHeader.writeUInt32LE(dataBuf.length, 22);
		localHeader.writeUInt16LE(nameBuf.length, 26);
		localHeader.writeUInt16LE(0, 28);

		localParts.push(localHeader, nameBuf, dataBuf);

		const centralHeader = Buffer.alloc(46);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0x0800, 8);
		centralHeader.writeUInt16LE(0, 10);
		centralHeader.writeUInt16LE(time, 12);
		centralHeader.writeUInt16LE(dosDate, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(dataBuf.length, 20);
		centralHeader.writeUInt32LE(dataBuf.length, 24);
		centralHeader.writeUInt16LE(nameBuf.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(0, 38);
		centralHeader.writeUInt32LE(offset, 42);

		centralParts.push(centralHeader, nameBuf);
		offset += localHeader.length + nameBuf.length + dataBuf.length;
	}

	const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...localParts, ...centralParts, end]);
}

function xmlEscape(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function columnName(index) {
	let n = index + 1;
	let name = "";
	while (n > 0) {
		const rem = (n - 1) % 26;
		name = String.fromCharCode(65 + rem) + name;
		n = Math.floor((n - 1) / 26);
	}
	return name;
}

function cellXml(value, rowIndex, colIndex, style = 0) {
	const ref = `${columnName(colIndex)}${rowIndex + 1}`;
	return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(
		value,
	)}</t></is></c>`;
}

function worksheetXml(rows, widths = []) {
	const cols = widths.length
		? `<cols>${widths
				.map(
					(width, idx) =>
						`<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`,
				)
				.join("")}</cols>`
		: "";

	const body = rows
		.map((row, rowIndex) => {
			const cells = row.cells || [];
			const height = row.height
				? ` ht="${row.height}" customHeight="1"`
				: "";
			return `<row r="${rowIndex + 1}"${height}>${cells
				.map((cell, colIndex) =>
					cellXml(cell?.value ?? "", rowIndex, colIndex, cell?.style || 0),
				)
				.join("")}</row>`;
		})
		.join("");

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${body}</sheetData></worksheet>`;
}

function row(values, style = 0, height = null) {
	return {
		height,
		cells: values.map((value) => ({ value, style })),
	};
}

function buildXlsxWorkbook(sheets) {
	const workbookSheets = sheets
		.map(
			(sheet, idx) =>
				`<sheet name="${xmlEscape(sheet.name)}" sheetId="${idx + 1}" r:id="rId${
					idx + 1
				}"/>`,
		)
		.join("");

	const workbookRels = sheets
		.map(
			(_sheet, idx) =>
				`<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
					idx + 1
				}.xml"/>`,
		)
		.join("");

	const sheetContentTypes = sheets
		.map(
			(_sheet, idx) =>
				`<Override PartName="/xl/worksheets/sheet${
					idx + 1
				}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
		)
		.join("");

	const files = [
		{
			name: "[Content_Types].xml",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetContentTypes}</Types>`,
		},
		{
			name: "_rels/.rels",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
		},
		{
			name: "xl/workbook.xml",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
		},
		{
			name: "xl/_rels/workbook.xml.rels",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
		},
		{
			name: "xl/styles.xml",
			data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
		},
		...sheets.map((sheet, idx) => ({
			name: `xl/worksheets/sheet${idx + 1}.xml`,
			data: worksheetXml(sheet.rows, sheet.widths),
		})),
	];

	return buildZip(files);
}

function formatExportDate(monthName, dayNumber) {
	const match = String(monthName || "").match(/^([A-Za-z]+)\s+(\d{4})$/);
	if (!match) return `${monthName || "Unknown month"} ${dayNumber}`;
	return `${match[1]} ${dayNumber}, ${match[2]}`;
}

function formatExportMonth(monthName) {
	const match = String(monthName || "").match(/^([A-Za-z]+)\s+(\d{4})$/);
	if (!match) return monthName || "Unknown month";
	const month =
		match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
	return `${month} ${match[2]}`;
}

function filenameSafe(value) {
	return String(value || "")
		.trim()
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

function equipmentMissingText(eq) {
	if (!eq) return "No equipment check";

	const missing = [];
	const leftMissing = eq.left === false;
	const rightMissing = eq.right === false;

	if (leftMissing && rightMissing) {
		missing.push("Both");
	} else {
		if (leftMissing) missing.push("Left");
		if (rightMissing) missing.push("Right");
	}

	if (eq.fmMic === false) missing.push("FM Mic");

	return missing.length ? missing.join("; ") : "None";
}

function newEquipmentMissingCounts() {
	return {
		left: 0,
		right: 0,
		both: 0,
		fmMic: 0,
	};
}

function addEquipmentMissingCounts(target, eq) {
	if (!eq) return;

	const leftMissing = eq.left === false;
	const rightMissing = eq.right === false;

	if (leftMissing && rightMissing) {
		target.both += 1;
	} else {
		if (leftMissing) target.left += 1;
		if (rightMissing) target.right += 1;
	}

	if (eq.fmMic === false) target.fmMic += 1;
}

function dayWord(n) {
	return n === 1 ? "day" : "days";
}

function equipmentMissingFromCounts(counts = {}) {
	return [
		counts.left ? "Left" : null,
		counts.right ? "Right" : null,
		counts.both ? "Both" : null,
		counts.fmMic ? "FM Mic" : null,
	]
		.filter(Boolean)
		.join(", ");
}

function equipmentLine(label, count, missedDays) {
	if (!count) return null;
	if (missedDays > 0 && count === missedDays) {
		return `${label} missing on all ${count} ${dayWord(count)}`;
	}
	return `${label} missing on ${count} ${dayWord(count)}`;
}

function hasEquipmentMissingCounts(counts = {}) {
	return Object.values(counts).some((count) => count > 0);
}

function formatMissingDaysList(days = []) {
	if (!days.length) return "No equipment missing on missed-check days";
	return days
		.slice()
		.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))
		.map(
			(d) =>
				`${formatExportDate(d.monthName, d.dayNumber)}: ${
					equipmentMissingFromCounts(d.equipmentMissing) ||
					"Equipment missing"
				}`,
		)
		.join("\n");
}

function formatCommentsList(comments = [], field) {
	if (!comments.length) return `no comments for ${FIELD_LABELS[field] || field}`;
	return comments
		.slice()
		.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))
		.map(
			(c) =>
				`${formatExportDate(c.monthName, c.dayNumber)}: ${
					c.commentText || ""
				}`,
		)
		.join("\n");
}

async function buildMonthlySoundCheckRows({ userId, monthDoc }) {
	const dayDocs = await Day.find({
		userId: new mongoose.Types.ObjectId(userId),
		month: monthDoc._id,
	})
		.select({ _id: 1, dayNumber: 1 })
		.lean();

	const current = new Date();
	const currentMonthName = `${current.toLocaleString("en-US", {
		month: "long",
	})} ${current.getFullYear()}`;
	const scopedDays =
		monthDoc.name === currentMonthName
			? dayDocs.filter(
					(d) =>
						typeof d.dayNumber === "number" &&
						d.dayNumber <= current.getDate(),
				)
			: dayDocs;

	const scopedDayIds = scopedDays.map((d) => d._id);
	const [checkDocs, equipDocs, commentDocs] = scopedDayIds.length
		? await Promise.all([
				Check.find({ user: userId, day: { $in: scopedDayIds } })
					.select({
						day: 1,
						checkone: 1,
						checktwo: 1,
						checkthree: 1,
						checkfour: 1,
						checkfive: 1,
						checksix: 1,
						checkseven: 1,
						checkeight: 1,
						checknine: 1,
						checkten: 1,
					})
					.lean(),
				EquipmentCheck.find({
					user: userId,
					day: { $in: scopedDayIds },
				})
					.select({ day: 1, left: 1, right: 1, fmMic: 1 })
					.lean(),
				Comment.find({
					user: userId,
					month: monthDoc._id,
					day: { $in: scopedDayIds },
				})
					.select({ field: 1, day: 1, commentText: 1 })
					.lean(),
			])
		: [[], [], []];

	const dayById = new Map(scopedDays.map((d) => [String(d._id), d]));
	const checkByDayId = new Map(checkDocs.map((c) => [String(c.day), c]));
	const equipByDayId = new Map(equipDocs.map((e) => [String(e.day), e]));
	const commentsByField = new Map(FIELD_ORDER.map((field) => [field, []]));

	for (const c of commentDocs) {
		const d = dayById.get(String(c.day));
		if (!d) continue;
		if (!commentsByField.has(c.field)) commentsByField.set(c.field, []);
		commentsByField.get(c.field).push({
			monthName: monthDoc.name,
			dayNumber: d.dayNumber,
			commentText: c.commentText,
		});
	}

	const totalDays = scopedDays.length;
	let equipmentAllPresentDays = 0;
	const equipmentMissingDays = [];

	for (const d of scopedDays) {
		const eq = equipByDayId.get(String(d._id));
		if (eq && eq.left === true && eq.right === true && eq.fmMic === true) {
			equipmentAllPresentDays += 1;
		}

		const dayEquipmentMissing = newEquipmentMissingCounts();
		addEquipmentMissingCounts(dayEquipmentMissing, eq);
		if (hasEquipmentMissingCounts(dayEquipmentMissing)) {
			equipmentMissingDays.push({
				monthName: monthDoc.name,
				dayNumber: d.dayNumber,
				equipmentMissing: dayEquipmentMissing,
			});
		}
	}

	const equipmentAllPresentPct = totalDays
		? Math.round((equipmentAllPresentDays / totalDays) * 100)
		: 0;

	const rows = [
		[
			"Hearing Assistive Technology",
			`${equipmentAllPresentDays}/${totalDays} ${dayWord(
				totalDays,
			)} had all equipment. ${equipmentAllPresentPct}%`,
			formatMissingDaysList(equipmentMissingDays).replace(
				"No equipment missing on missed-check days",
				"No equipment missing this month",
			),
			"",
		],
	];

	for (const field of FIELD_ORDER) {
		let missed = 0;
		const equipmentMissing = newEquipmentMissingCounts();
		const fieldEquipmentMissingDays = [];

		for (const d of scopedDays) {
			const check = checkByDayId.get(String(d._id));
			if (!check || check[field] !== false) continue;

			missed += 1;
			const eq = equipByDayId.get(String(d._id));
			addEquipmentMissingCounts(equipmentMissing, eq);

			const dayEquipmentMissing = newEquipmentMissingCounts();
			addEquipmentMissingCounts(dayEquipmentMissing, eq);
			if (hasEquipmentMissingCounts(dayEquipmentMissing)) {
				fieldEquipmentMissingDays.push({
					monthName: monthDoc.name,
					dayNumber: d.dayNumber,
					equipmentMissing: dayEquipmentMissing,
				});
			}
		}

		const statsLines = [
			`${missed} ${dayWord(missed)} with a missed check`,
			equipmentLine("Left", equipmentMissing.left, missed),
			equipmentLine("Right", equipmentMissing.right, missed),
			equipmentLine("Both", equipmentMissing.both, missed),
			equipmentLine("FM Mic", equipmentMissing.fmMic, missed),
		].filter(Boolean);

		rows.push([
			FIELD_LABELS[field] || field,
			statsLines.join("\n"),
			formatMissingDaysList(fieldEquipmentMissingDays),
			formatCommentsList(commentsByField.get(field) || [], field),
		]);
	}

	return rows;
}

async function assertTenantAndPermForDay({ req, dayId, userId }) {
	const day = await Day.findById(dayId).lean();
	if (!day) return { ok: false, status: 404, msg: "Day not found" };

	if (String(day.userId) !== String(userId)) {
		return { ok: false, status: 400, msg: "Day/user mismatch" };
	}

	// tenant check via month
	const month = await Month.findById(day.month).lean();
	if (!month) return { ok: false, status: 404, msg: "Month not found" };
	if (String(month.adminUser) !== String(req.user.adminUser)) {
		return { ok: false, status: 403, msg: "Forbidden (tenant mismatch)" };
	}

	// permissions: must be the student themself OR an admin in same tenant
	if (req.user.role !== "admin" && req.user.id !== userId) {
		return { ok: false, status: 403, msg: "Forbidden" };
	}

	const st = day?.transcription?.status;
	if (st === "queued" || st === "processing") {
		return {
			ok: false,
			status: 423,
			msg: "This day is currently transcribing. Please wait until it finishes.",
		};
	}

	return { ok: true, day };
}

async function queueDayIfAvailable({ dayId, userId, token, staleCutoff }) {
	const updated = await Day.findOneAndUpdate(
		{
			_id: dayId,
			$or: [
				{
					"transcription.status": {
						$nin: ["queued", "processing"],
					},
				},
				{
					"transcription.status": "queued",
					"transcription.requestedAt": { $lt: staleCutoff },
				},
				{
					"transcription.status": "processing",
					"transcription.startedAt": { $lt: staleCutoff },
				},
				{ transcription: { $exists: false } },
			],
		},
		{
			$set: {
				"transcription.status": "queued",
				"transcription.requestedAt": new Date(),
				"transcription.startedAt": null,
				"transcription.finishedAt": null,
				"transcription.error": null,
			},
		},
		{ new: true },
	).lean();

	if (!updated) return null;

	await enqueueDayTranscription({ dayId, userId, token });
	return updated;
}

function assertDayEditAllowed({ req, day }) {
	const dayLocked = !!day?.editingLock?.dayLocked;
	if (dayLocked && req.user.role !== "admin") {
		return {
			ok: false,
			status: 423,
			msg: "This day is locked by the teacher.",
		};
	}
	return { ok: true };
}

// POST /api/recordings/transcribe-month  (queue all month recordings in background)
router.post("/transcribe-month", auth, async (req, res) => {
	try {
		const { monthId, userId } = req.body;
		console.log("[recordings/transcribe-month] request", {
			monthId,
			userId,
			requesterId: req.user?.id,
			requesterRole: req.user?.role,
		});

		if (
			!mongoose.isValidObjectId(monthId) ||
			!mongoose.isValidObjectId(userId)
		) {
			return res.status(400).json({ msg: "Invalid ids" });
		}

		if (req.user.role !== "admin" && req.user.id !== userId) {
			return res.status(403).json({ msg: "Forbidden" });
		}

		const month = await Month.findById(monthId).lean();
		if (!month) return res.status(404).json({ msg: "Month not found" });
		if (String(month.userId) !== String(userId)) {
			return res.status(400).json({ msg: "Month/user mismatch" });
		}
		if (String(month.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });
		}

		const dayDocs = await Day.find({ month: monthId, userId })
			.select("_id dayNumber editingLock transcription")
			.lean();
		const dayIds = dayDocs.map((day) => day._id);
		const recordings = dayIds.length
			? await Recording.find({
					user: userId,
					day: { $in: dayIds },
					audioFileId: { $exists: true, $ne: null },
				})
					.select("day")
					.lean()
			: [];

		const daysWithAudio = new Set(recordings.map((rec) => String(rec.day)));
		const token = req.header("x-auth-token");
		const staleCutoff = new Date(Date.now() - TRANSCRIBE_STALE_MS);
		const queuedDays = [];
		const skippedLockedDays = [];
		let skippedAlreadyTranscribing = 0;

		for (const day of dayDocs) {
			if (!daysWithAudio.has(String(day._id))) continue;
			if (day?.editingLock?.dayLocked && req.user.role !== "admin") {
				skippedLockedDays.push(day.dayNumber);
				continue;
			}

			const updated = await queueDayIfAvailable({
				dayId: day._id,
				userId,
				token,
				staleCutoff,
			});

			if (updated) queuedDays.push(day.dayNumber);
			else skippedAlreadyTranscribing += 1;
		}

		const msg = queuedDays.length
			? `Queued ${queuedDays.length} day${
					queuedDays.length === 1 ? "" : "s"
				} for transcription.`
			: recordings.length
				? "No new days were queued. They may already be transcribing or locked."
				: "No saved recordings with audio were found for this month.";

		console.log("[recordings/transcribe-month] queued", {
			monthId,
			userId,
			recordingCount: recordings.length,
			queuedDays,
			skippedAlreadyTranscribing,
			skippedLockedDays,
		});

		return res.status(202).json({
			ok: true,
			status: queuedDays.length ? "queued" : "idle",
			msg,
			recordingCount: recordings.length,
			queuedDayCount: queuedDays.length,
			queuedDays,
			skippedAlreadyTranscribing,
			skippedLockedDays,
		});
	} catch (e) {
		console.error("POST /api/recordings/transcribe-month error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// POST /api/recordings/transcribe-day  (queue transcription in background)
router.post("/transcribe-day", auth, async (req, res) => {
	try {
		const { dayId, userId } = req.body;
		console.log("[recordings/transcribe-day] request", {
			dayId,
			userId,
			requesterId: req.user?.id,
			requesterRole: req.user?.role,
		});

		if (
			!mongoose.isValidObjectId(dayId) ||
			!mongoose.isValidObjectId(userId)
		) {
			return res.status(400).json({ msg: "Invalid ids" });
		}

		// must be the student OR an admin
		if (req.user.role !== "admin" && req.user.id !== userId) {
			return res.status(403).json({ msg: "Forbidden" });
		}

		const day = await Day.findById(dayId).lean();
		if (!day) return res.status(404).json({ msg: "Day not found" });

		// day/user match
		if (String(day.userId) !== String(userId)) {
			return res.status(400).json({ msg: "Day/user mismatch" });
		}

		// tenant check via month
		const month = await Month.findById(day.month).lean();
		if (!month) return res.status(404).json({ msg: "Month not found" });
		if (String(month.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });
		}

		// NEW: block only non-admin users when the day is teacher-locked
		if (day?.editingLock?.dayLocked && req.user.role !== "admin") {
			return res.status(423).json({
				msg: "This day is locked by the teacher.",
			});
		}

		// refuse if already locked (unless stale)
		const now = Date.now();
		const staleCutoff = new Date(now - TRANSCRIBE_STALE_MS);

		const updated = await queueDayIfAvailable({
			dayId,
			userId,
			token: req.header("x-auth-token"),
			staleCutoff,
		});

		if (!updated) {
			return res
				.status(409)
				.json({ msg: "This day is already transcribing." });
		}

		console.log("[recordings/transcribe-day] queued", {
			dayId,
			userId,
			status: updated.transcription?.status || "queued",
		});

		return res.status(202).json({
			ok: true,
			status: updated.transcription?.status || "queued",
		});
	} catch (e) {
		console.error("POST /api/recordings/transcribe-day error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// POST /api/recordings  (create or replace audio for a day/field)
// multipart/form-data:
// - dayId, userId, field, durationAudioMs
// - audio (file)
router.post("/", auth, upload.single("audio"), async (req, res) => {
	try {
		const { dayId, userId, field, durationAudioMs } = req.body;

		if (
			!mongoose.isValidObjectId(dayId) ||
			!mongoose.isValidObjectId(userId)
		) {
			return res.status(400).json({ msg: "Invalid ids" });
		}
		if (!isValidField(field)) {
			return res.status(400).json({ msg: "Invalid field" });
		}

		const perm = await assertTenantAndPermForDay({ req, dayId, userId });
		if (!perm.ok) return res.status(perm.status).json({ msg: perm.msg });

		const editPerm = assertDayEditAllowed({ req, day: perm.day });
		if (!editPerm.ok) {
			return res.status(editPerm.status).json({ msg: editPerm.msg });
		}

		const existing = await Recording.findOne({
			day: dayId,
			user: userId,
			field,
		})
			.select("_id")
			.lean();
		if (existing) {
			return res.status(409).json({
				msg: "A recording for this sound check has already been saved for this day.",
			});
		}

		const bucket = getBucket();

		const saveOne = async (file) =>
			new Promise((resolve, reject) => {
				if (!file) return resolve(null);
				const stream = bucket.openUploadStream(file.originalname, {
					contentType: file.mimetype || "audio/webm",
				});
				stream.end(file.buffer, (err) => {
					if (err) return reject(err);
					resolve(stream.id);
				});
			});

		const audioFile = req.file || null;
		const audioFileId = await saveOne(audioFile);

		const rec = await Recording.create({
			day: dayId,
			user: userId,
			field,
			audioFileId,
			durationAudioMs:
				durationAudioMs != null ? Number(durationAudioMs) : undefined,
		});

		return res.json(rec);
	} catch (e) {
		console.error("POST /api/recordings error", e);
		if (e?.code === 11000) {
			return res.status(409).json({
				msg: "A recording for this sound check has already been saved for this day.",
			});
		}
		return res.status(500).json({ msg: "Server error" });
	}
});

// GET /api/recordings/by-day?day=...&user=...
// NOTE: viewing is still allowed on locked days for the owner/admin.
// This route intentionally does NOT apply assertDayEditAllowed.
router.get("/by-day", auth, async (req, res) => {
	try {
		const { day, user } = req.query;
		if (!mongoose.isValidObjectId(day) || !mongoose.isValidObjectId(user)) {
			return res.status(400).json({ msg: "Invalid query params" });
		}

		const perm = await assertTenantAndPermForDay({
			req,
			dayId: day,
			userId: user,
		});
		if (!perm.ok) return res.status(perm.status).json({ msg: perm.msg });

		const list = await Recording.find({ day, user })
			.sort({ createdAt: -1 })
			.lean();

		return res.json(list);
	} catch (e) {
		console.error("GET /api/recordings/by-day error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// GET /api/recordings/export-day?day=...&user=...
router.get("/export-day", auth, async (req, res) => {
	try {
		const { day, user } = req.query;
		if (!mongoose.isValidObjectId(day) || !mongoose.isValidObjectId(user)) {
			return res.status(400).json({ msg: "Invalid query params" });
		}

		const perm = await assertTenantAndPermForDay({
			req,
			dayId: day,
			userId: user,
		});
		if (!perm.ok) return res.status(perm.status).json({ msg: perm.msg });

		const dayDoc = perm.day;
		const [month, student, adminOrg, monthDays] = await Promise.all([
			Month.findById(dayDoc.month).lean(),
			User.findById(user).select("username").lean(),
			AdminUser.findById(dayDoc.adminUser || req.user.adminUser)
				.select("name")
				.lean(),
			Day.find({
				userId: user,
				month: dayDoc.month,
			})
				.select("_id dayNumber")
				.lean(),
		]);

		if (!month) return res.status(404).json({ msg: "Month not found" });
		if (!student) return res.status(404).json({ msg: "User not found" });

		const monthLabel = formatExportMonth(month.name);
		const monthDayIds = monthDays.map((monthDay) => monthDay._id);
		const [equipmentChecks, recordings] = monthDayIds.length
			? await Promise.all([
					EquipmentCheck.find({
						user,
						month: dayDoc.month,
						day: { $in: monthDayIds },
					}).lean(),
					Recording.find({
						user,
						day: { $in: monthDayIds },
					})
						.select("day field audioText audioIPA createdAt")
						.lean(),
				])
			: [[], []];
		const monthlySoundCheckRows = await buildMonthlySoundCheckRows({
			userId: user,
			monthDoc: month,
		});
		const dayById = new Map(
			monthDays.map((monthDay) => [String(monthDay._id), monthDay]),
		);
		const equipmentByDayId = new Map(
			equipmentChecks.map((equipmentCheck) => [
				String(equipmentCheck.day),
				equipmentCheck,
			]),
		);
		const sortedRecordings = [...recordings].sort((a, b) => {
			const aDayNumber =
				dayById.get(String(a.day))?.dayNumber ?? Number.MAX_SAFE_INTEGER;
			const bDayNumber =
				dayById.get(String(b.day))?.dayNumber ?? Number.MAX_SAFE_INTEGER;
			if (aDayNumber !== bDayNumber) return aDayNumber - bDayNumber;

			const aIndex = FIELD_ORDER.indexOf(a.field);
			const bIndex = FIELD_ORDER.indexOf(b.field);
			return (
				(aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
				(bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
			);
		});

		const recordingsSheet = [
			row(["Student", student.username || "Unknown student"], 1),
			row(["Teacher", adminOrg?.name || "Unknown teacher"], 1),
			row(["Month", monthLabel], 1),
			row([]),
			row(
				[
					"Date",
					"Sound",
					"Text",
					"IPA Transcription",
					"Equipment Missing",
				],
				2,
			),
			...sortedRecordings.map((rec) => {
				const recDay = dayById.get(String(rec.day));
				const recDateLabel = recDay
					? formatExportDate(month.name, recDay.dayNumber)
					: monthLabel;
				const recEquipmentMissing = equipmentMissingText(
					equipmentByDayId.get(String(rec.day)),
				);
				return row(
					[
						recDateLabel,
						FIELD_LABELS[rec.field] || rec.field,
						rec.audioText || "",
						rec.audioIPA || "",
						recEquipmentMissing,
					],
					3,
					48,
				);
			}),
		];

		const soundCheckSheet = [
			row(["Student", student.username || "Unknown student"], 1),
			row(["Teacher", adminOrg?.name || "Unknown teacher"], 1),
			row(["Month", monthLabel], 1),
			row([]),
			row(
				[
					"Sound",
					"Statistics",
					"Days Equipment Was Missing",
					`Comments (${monthLabel})`,
				],
				2,
			),
			...monthlySoundCheckRows.map((summaryRow) =>
				row(summaryRow, 3, 72),
			),
		];

		const workbook = buildXlsxWorkbook([
			{
				name: "Recordings",
				widths: [22, 16, 34, 34, 24],
				rows: recordingsSheet,
			},
			{
				name: "Sound Check Success",
				widths: [28, 34, 42, 52],
				rows: soundCheckSheet,
			},
		]);

		const filename = [
			"transcriptions",
			filenameSafe(student.username),
			filenameSafe(monthLabel),
		]
			.filter(Boolean)
			.join("-");

		res.setHeader(
			"Content-Type",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${filename || "transcriptions"}.xlsx"`,
		);
		return res.send(workbook);
	} catch (e) {
		console.error("GET /api/recordings/export-day error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// GET /api/recordings/file/:id  (stream GridFS audio)
router.get("/file/:id", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) return res.status(400).end();
		const bucket = getBucket();
		bucket
			.openDownloadStream(new mongoose.Types.ObjectId(id))
			.on("error", () => res.status(404).end())
			.pipe(res);
	} catch {
		res.status(500).end();
	}
});

// POST /api/recordings/:id/upload
// Replace audio on an existing Recording.
// Also updates durationAudioMs if provided.
router.post("/:id/upload", auth, upload.single("audio"), async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) {
			return res.status(400).json({ msg: "Invalid id" });
		}

		const rec = await Recording.findById(id);
		if (!rec) return res.status(404).json({ msg: "Recording not found" });

		const day = await Day.findById(rec.day).lean();
		if (!day) return res.status(404).json({ msg: "Day not found" });

		const st = day?.transcription?.status;
		if (st === "queued" || st === "processing") {
			return res.status(423).json({
				msg: "This day is currently transcribing. Please wait until it finishes.",
			});
		}

		// NEW: block only non-admin users when day is locked
		if (day?.editingLock?.dayLocked && req.user.role !== "admin") {
			return res.status(423).json({
				msg: "This day is locked by the teacher.",
			});
		}

		// Tenant check via month
		const month = await Month.findById(day.month).lean();
		if (!month) return res.status(404).json({ msg: "Month not found" });
		if (String(month.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });
		}

		// Permissions: owner or admin
		if (
			req.user.role !== "admin" &&
			String(rec.user) !== String(req.user.id)
		) {
			return res.status(403).json({ msg: "Forbidden" });
		}

		const db = mongoose.connection.db;
		const filesColl = db.collection("audio.files");
		const chunksColl = db.collection("audio.chunks");
		const bucket = getBucket();

		const audioFile = req.file || null;

		console.log("[recordings/:id/upload] incoming", {
			id,
			hasAudioFile: !!audioFile,
			oldAudioFileId: rec.audioFileId ? String(rec.audioFileId) : null,
			durationAudioMs: req.body.durationAudioMs,
		});

		// upload-first, then best-effort delete old file (using hard-delete)
		const replaceOne = async (oldId, file, defaultName) => {
			if (!file) return oldId;

			// 1) upload new file, get its id
			const stream = bucket.openUploadStream(
				file.originalname || defaultName,
				{
					contentType: file.mimetype || "audio/webm",
				},
			);
			await new Promise((resolve, reject) => {
				stream.end(file.buffer, (err) =>
					err ? reject(err) : resolve(),
				);
			});
			const newId = stream.id;

			// 2) best-effort hard-delete the old GridFS doc + chunks
			if (oldId) {
				try {
					const oid =
						oldId instanceof ObjectId
							? oldId
							: new ObjectId(String(oldId));

					const preFiles = await filesColl
						.find({ _id: oid })
						.toArray();
					const preChunks = await chunksColl
						.find({ files_id: oid })
						.toArray();

					console.log("[recordings/:id/upload] old file PRE state", {
						oldId: String(oid),
						filesCount: preFiles.length,
						chunksCount: preChunks.length,
					});

					const fileResult = await filesColl.deleteMany({ _id: oid });
					const chunkResult = await chunksColl.deleteMany({
						files_id: oid,
					});

					console.log("[recordings/:id/upload] old file deleteMany", {
						oldId: String(oid),
						filesDeleted: fileResult.deletedCount,
						chunksDeleted: chunkResult.deletedCount,
					});
				} catch (err) {
					console.error(
						"[recordings/:id/upload] hard-delete old file error",
						String(oldId),
						err?.message || err,
					);
				}
			}

			return newId;
		};

		rec.audioFileId = await replaceOne(
			rec.audioFileId,
			audioFile,
			"audio.webm",
		);

		if (req.body.durationAudioMs != null) {
			rec.durationAudioMs = Number(req.body.durationAudioMs);
		}

		await rec.save();

		console.log("[recordings/:id/upload] updated rec", {
			id: rec._id.toString(),
			audioFileId: rec.audioFileId ? String(rec.audioFileId) : null,
			durationAudioMs: rec.durationAudioMs,
		});

		return res.json(rec);
	} catch (e) {
		console.error("POST /api/recordings/:id/upload error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// POST /api/recordings/:id/transcribe
router.post("/:id/transcribe", auth, async (req, res) => {
	const startedAt = Date.now();
	const memAtStart = process.memoryUsage();

	const diag = (extra = {}) => ({
		stage: extra.stage || "unknown",
		elapsedMs: Date.now() - startedAt,
		rss: process.memoryUsage().rss,
		rssStart: memAtStart.rss,
		...extra,
	});

	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id))
			return res.status(400).json({ msg: "Invalid id" });

		const rec = await Recording.findById(id);
		if (!rec) return res.status(404).json({ msg: "Recording not found" });
		if (req.user.role !== "admin" && String(rec.user) !== req.user.id) {
			return res.status(403).json({ msg: "Forbidden" });
		}

		const internalJob = req.get("x-transcribe-job") === "1";
		console.log("[recordings/:id/transcribe] start", {
			id,
			field: rec.field,
			userId: String(rec.user),
			dayId: String(rec.day),
			internalJob,
			hasAudio: !!rec.audioFileId,
			audioFileId: rec.audioFileId ? String(rec.audioFileId) : null,
		});
		if (!internalJob) {
			const day = await Day.findById(rec.day)
				.select("transcription.status editingLock")
				.lean();
			const st = day?.transcription?.status;
			if (st === "queued" || st === "processing") {
				return res.status(423).json({
					msg: "This day is currently transcribing. Please wait until it finishes.",
				});
			}

			// NEW: block only non-admin users when day is locked
			if (day?.editingLock?.dayLocked && req.user.role !== "admin") {
				return res.status(423).json({
					msg: "This day is locked by the teacher.",
				});
			}
		}

		// ---- run Python worker (faster-whisper + phonemizer) via child_process ----
		const fs = require("fs");
		const os = require("os");
		const { spawn } = require("child_process");
		const path = require("path");
		const bucket = getBucket();

		function tail(str, n = 4000) {
			if (!str) return "";
			return str.length > n ? str.slice(-n) : str;
		}

		async function dump(fileId) {
			return new Promise((resolve, reject) => {
				if (!fileId) return resolve(null);
				const file = path.join(os.tmpdir(), `${fileId}.webm`);
				const ws = fs.createWriteStream(file);
				bucket
					.openDownloadStream(fileId)
					.on("error", (err) =>
						reject(Object.assign(err, { stage: "dump" })),
					)
					.pipe(ws)
					.on("finish", () => resolve(file));
			});
		}

		async function toWav16kMono(inputPath) {
			if (!inputPath) return null;
			const out = inputPath.replace(/\.webm$/i, ".wav");
			await new Promise((resolve, reject) => {
				let stderr = "";
				const ff = spawn("ffmpeg", [
					"-y",
					"-hide_banner",
					"-loglevel",
					"error",
					"-i",
					inputPath,
					"-ac",
					"1",
					"-ar",
					"16000",
					"-f",
					"wav",
					out,
				]);
				ff.stderr.on("data", (d) => (stderr += d.toString()));
				ff.on("close", (code, signal) => {
					if (code === 0) return resolve();
					const err = new Error("ffmpeg failed");
					err.code = code;
					err.signal = signal;
					err.stderr = stderr;
					err.stage = "ffmpeg";
					return reject(err);
				});
				ff.on("error", (err) => {
					err.stage = "ffmpeg-spawn";
					reject(err);
				});
			});
			return out;
		}

		function callPy(inputPath) {
			return new Promise((resolve) => {
				if (!inputPath) return resolve({ ok: true, text: "", ipa: "" });
				const child = require("child_process").spawn(
					"python3",
					[path.join(__dirname, "../utils/transcribe.py"), inputPath],
					{ stdio: ["ignore", "pipe", "pipe"] },
				);
				let out = "";
				let err = "";
				child.stdout.on("data", (d) => (out += d.toString()));
				child.stderr.on("data", (d) => (err += d.toString()));
				child.on("close", (code, signal) => {
					const oomLikely = signal === "SIGKILL" || code === 137;
					try {
						const parsed = JSON.parse(out);
						return resolve({
							ok: true,
							...parsed,
							stderrTail: tail(err),
							code,
							signal,
							oomLikely,
						});
					} catch {
						return resolve({
							ok: false,
							text: "",
							ipa: "",
							stdoutTail: tail(out),
							stderrTail: tail(err),
							code,
							signal,
							oomLikely,
						});
					}
				});
				child.on("error", (errObj) => {
					return resolve({
						ok: false,
						text: "",
						ipa: "",
						spawnError: String(errObj),
						stderrTail: "",
						stdoutTail: "",
						code: null,
						signal: null,
						oomLikely: false,
					});
				});
			});
		}

		let aPath = null;
		let aWav = null;

		// DUMP
		try {
			aPath = await dump(rec.audioFileId);
			console.log("[recordings/:id/transcribe] dump complete", {
				id,
				aPath,
				hasPath: !!aPath,
			});
		} catch (err) {
			console.error("dump error", err);
			return res.status(500).json(
				diag({
					stage: err.stage || "dump",
					msg: "Failed to dump from GridFS",
					error: String(err),
				}),
			);
		}

		// FFMPEG
		try {
			aWav = await toWav16kMono(aPath);
			console.log("[recordings/:id/transcribe] ffmpeg complete", {
				id,
				aWav,
				hasPath: !!aWav,
			});
		} catch (err) {
			console.error("ffmpeg error", err);
			return res.status(500).json(
				diag({
					stage: err.stage || "ffmpeg",
					msg: "Transcode failed",
					code: err.code ?? null,
					signal: err.signal ?? null,
					stderrTail: err.stderr ? tail(err.stderr) : "",
				}),
			);
		}

		// PYTHON
		const audioRes = await callPy(aWav);
		console.log("[recordings/:id/transcribe] python complete", {
			id,
			ok: audioRes.ok,
			code: audioRes.code,
			signal: audioRes.signal,
			oomLikely: audioRes.oomLikely,
			hasText: !!audioRes.text,
			hasIPA: !!audioRes.ipa,
			textPreview: audioRes.text ? audioRes.text.slice(0, 120) : "",
			ipaPreview: audioRes.ipa ? audioRes.ipa.slice(0, 120) : "",
			stderrTail: audioRes.stderrTail,
			stdoutTail: audioRes.stdoutTail,
			spawnError: audioRes.spawnError,
		});

		if (!audioRes.ok) {
			return res.status(500).json(
				diag({
					stage: "python",
					msg: "Transcription failed",
					audio: audioRes,
				}),
			);
		}

		rec.audioText = audioRes.text || "";
		rec.audioIPA = audioRes.ipa || "";
		await rec.save();
		console.log("[recordings/:id/transcribe] saved", {
			id,
			hasText: !!rec.audioText,
			hasIPA: !!rec.audioIPA,
			textLength: rec.audioText ? rec.audioText.length : 0,
			ipaLength: rec.audioIPA ? rec.audioIPA.length : 0,
		});

		return res.json(rec);
	} catch (e) {
		console.error("POST /api/recordings/:id/transcribe error", e);
		return res.status(500).json({
			...diag({
				stage: "node-catch",
				msg: "Unhandled error in transcribe route",
			}),
			error: String(e),
		});
	}
});

// GET /api/recordings/:id/csv
router.get("/:id/csv", auth, async (req, res) => {
	try {
		const { id } = req.params;
		if (!mongoose.isValidObjectId(id)) return res.status(400).end();
		const r = await Recording.findById(id).lean();
		if (!r) return res.status(404).end();
		if (req.user.role !== "admin" && String(r.user) !== req.user.id)
			return res.status(403).end();

		const rows = [
			["role", "text", "ipa"],
			["audio", r.audioText || "", r.audioIPA || ""],
		];
		const csv = rows
			.map((cols) =>
				cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
			)
			.join("\n");

		res.setHeader("Content-Type", "text/csv");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=recording-${id}.csv`,
		);
		res.send(csv);
	} catch {
		res.status(500).end();
	}
});

router.delete("/:id", auth, async (req, res) => {
	console.log(
		"[recordings.js] DELETE hit",
		"params.id=",
		req.params.id,
		"user.id=",
		req.user && req.user.id,
		"role=",
		req.user && req.user.role,
	);

	try {
		const { id } = req.params;

		if (!mongoose.isValidObjectId(id)) {
			console.log("[recordings.js] invalid id:", id);
			return res.status(400).json({ msg: "Invalid id" });
		}

		const rec = await Recording.findById(id);

		if (!rec) {
			console.log("[recordings.js] not found:", id);
			return res.status(404).json({ msg: "Recording not found" });
		}

		const day = await Day.findById(rec.day)
			.select("month transcription.status editingLock")
			.lean();
		const st = day?.transcription?.status;
		if (st === "queued" || st === "processing") {
			return res.status(423).json({
				msg: "This day is currently transcribing. Please wait until it finishes.",
			});
		}

		// NEW: block only non-admin users when day is locked
		if (day?.editingLock?.dayLocked && req.user.role !== "admin") {
			return res.status(423).json({
				msg: "This day is locked by the teacher.",
			});
		}

		// Tenant check via month
		const month = await Month.findById(day.month).lean();
		if (!month) return res.status(404).json({ msg: "Month not found" });
		if (String(month.adminUser) !== String(req.user.adminUser)) {
			return res.status(403).json({ msg: "Forbidden (tenant mismatch)" });
		}

		// Permissions: owner or admin
		if (
			req.user.role !== "admin" &&
			String(rec.user) !== String(req.user.id)
		) {
			console.log(
				"[recordings.js] forbidden delete",
				"requester=",
				req.user.id,
				"owner=",
				String(rec.user),
			);
			return res.status(403).json({ msg: "Forbidden" });
		}

		console.log("[recordings.js] will delete files:", {
			audioFileId: rec.audioFileId ? String(rec.audioFileId) : null,
			audioType: rec.audioFileId && typeof rec.audioFileId,
		});

		// Delete doc first
		await Recording.deleteOne({ _id: id });
		console.log("[recordings.js] doc deleted", id);

		// Hard-delete GridFS entries
		try {
			const db = mongoose.connection.db;
			const filesColl = db.collection("audio.files");
			const chunksColl = db.collection("audio.chunks");

			const rawIds = [];
			if (rec.audioFileId) rawIds.push(rec.audioFileId);

			const oids = [];
			for (const raw of rawIds) {
				try {
					const oid =
						raw instanceof ObjectId
							? raw
							: new ObjectId(String(raw));
					oids.push(oid);
				} catch (err) {
					console.error(
						"[recordings.js] ObjectId conversion error (hard-delete)",
						"raw=",
						raw,
						"error=",
						err.message || err,
					);
				}
			}

			if (!oids.length) {
				console.log(
					"[recordings.js] no file ObjectIds to hard-delete for recording",
					id,
				);
			} else {
				console.log(
					"[recordings.js] hard-delete starting for OIDs=",
					oids.map((o) => String(o)),
				);

				const preFiles = await filesColl
					.find({ _id: { $in: oids } })
					.toArray();
				const preChunks = await chunksColl
					.find({ files_id: { $in: oids } })
					.toArray();
				console.log("[recordings.js] hard-delete PRE state", {
					fileIds: oids.map((o) => String(o)),
					filesCount: preFiles.length,
					chunksCount: preChunks.length,
				});

				const fileResult = await filesColl.deleteMany({
					_id: { $in: oids },
				});
				const chunkResult = await chunksColl.deleteMany({
					files_id: { $in: oids },
				});

				console.log("[recordings.js] hard-delete deleteMany results", {
					fileIds: oids.map((o) => String(o)),
					filesDeleted: fileResult.deletedCount,
					chunksDeleted: chunkResult.deletedCount,
				});

				const postFiles = await filesColl
					.find({ _id: { $in: oids } })
					.toArray();
				const postChunks = await chunksColl
					.find({ files_id: { $in: oids } })
					.toArray();
				console.log("[recordings.js] hard-delete POST state", {
					fileIds: oids.map((o) => String(o)),
					filesCount: postFiles.length,
					chunksCount: postChunks.length,
				});
			}
		} catch (err) {
			console.error(
				"[recordings.js] hard-delete fatal error",
				err.message || err,
			);
		}

		console.log("[recordings.js] DELETE success", id);
		return res.json({ ok: true, id });
	} catch (e) {
		console.error("[recordings.js] DELETE error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
