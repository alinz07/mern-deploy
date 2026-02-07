// backend/routes/recordings.js
const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const auth = require("../middleware/auth");

const Recording = require("../models/Recording");
const Day = require("../models/Day");
const Month = require("../models/Month");

console.log("[recordings.js] routes module loaded");

// -------------------- background transcription queue --------------------
const TRANSCRIBE_STALE_MS = 30 * 60 * 1000; // 30 minutes
const selfBase = `http://127.0.0.1:${process.env.PORT || 8000}`;

const transcribeQueue = [];
let transcribeWorkerRunning = false;

async function enqueueDayTranscription({ dayId, userId, token }) {
	transcribeQueue.push({ dayId, userId, token });
	runTranscribeWorker().catch((e) =>
		console.error("[transcribeWorker] fatal", e)
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
	// mark processing
	await Day.updateOne(
		{ _id: dayId },
		{
			$set: {
				"transcription.status": "processing",
				"transcription.startedAt": new Date(),
				"transcription.error": null,
			},
		}
	);

	try {
		// find recordings for this day/user
		const recs = await Recording.find({ day: dayId, user: userId })
			.select("_id audioFileId")
			.lean();

		const ids = recs.filter((r) => r.audioFileId).map((r) => String(r._id));

		// nothing to do
		if (!ids.length) {
			await Day.updateOne(
				{ _id: dayId },
				{
					$set: {
						"transcription.status": "done",
						"transcription.finishedAt": new Date(),
					},
				}
			);
			return;
		}

		// run sequentially to avoid OOM / spikes
		for (const id of ids) {
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
				}
			);

			if (!resp.ok) {
				const txt = await resp.text().catch(() => "");
				throw new Error(
					`Transcribe failed (${resp.status}): ${txt.slice(0, 300)}`
				);
			}
		}

		await Day.updateOne(
			{ _id: dayId },
			{
				$set: {
					"transcription.status": "done",
					"transcription.finishedAt": new Date(),
				},
			}
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
			}
		);
	}
}

// POST /api/recordings/transcribe-day  (queue transcription in background)
router.post("/transcribe-day", auth, async (req, res) => {
	try {
		const { dayId, userId } = req.body;

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

		// refuse if already locked (unless stale)
		const now = Date.now();
		const staleCutoff = new Date(now - TRANSCRIBE_STALE_MS);

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
			{ new: true }
		).lean();

		if (!updated) {
			return res
				.status(409)
				.json({ msg: "This day is already transcribing." });
		}

		const token = req.header("x-auth-token");
		await enqueueDayTranscription({ dayId, userId, token });

		return res.status(202).json({
			ok: true,
			status: updated.transcription?.status || "queued",
		});
	} catch (e) {
		console.error("POST /api/recordings/transcribe-day error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

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

		// Enforce ONE recording per (day, user, field) by upserting.
		const filter = { day: dayId, user: userId, field };

		const set = {};
		if (audioFileId) set.audioFileId = audioFileId;
		if (durationAudioMs != null)
			set.durationAudioMs = Number(durationAudioMs);

		const update = {
			$set: set,
			$setOnInsert: {
				day: dayId,
				user: userId,
				field,
			},
		};

		const rec = await Recording.findOneAndUpdate(filter, update, {
			new: true,
			upsert: true,
			setDefaultsOnInsert: true,
		});

		return res.json(rec);
	} catch (e) {
		console.error("POST /api/recordings error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

// GET /api/recordings/by-day?day=...&user=...
router.get("/by-day", auth, async (req, res) => {
	try {
		const { day, user } = req.query;
		if (!mongoose.isValidObjectId(day) || !mongoose.isValidObjectId(user)) {
			return res.status(400).json({ msg: "Invalid query params" });
		}

		// Make sure requester is owner or same-tenant admin, and tenant matches month
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
				}
			);
			await new Promise((resolve, reject) => {
				stream.end(file.buffer, (err) =>
					err ? reject(err) : resolve()
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
						err?.message || err
					);
				}
			}

			return newId;
		};

		rec.audioFileId = await replaceOne(
			rec.audioFileId,
			audioFile,
			"audio.webm"
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
		if (!internalJob) {
			const day = await Day.findById(rec.day)
				.select("transcription.status")
				.lean();
			const st = day?.transcription?.status;
			if (st === "queued" || st === "processing") {
				return res.status(423).json({
					msg: "This day is currently transcribing. Please wait until it finishes.",
				});
			}
		}

		// ---- run Python worker (faster-whisper + phonemizer) via child_process ----
		// Stream from GridFS -> temp .webm -> transcode to 16k mono .wav -> python
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
						reject(Object.assign(err, { stage: "dump" }))
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
					{ stdio: ["ignore", "pipe", "pipe"] }
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
		} catch (err) {
			console.error("dump error", err);
			return res.status(500).json(
				diag({
					stage: err.stage || "dump",
					msg: "Failed to dump from GridFS",
					error: String(err),
				})
			);
		}

		// FFMPEG
		try {
			aWav = await toWav16kMono(aPath);
		} catch (err) {
			console.error("ffmpeg error", err);
			return res.status(500).json(
				diag({
					stage: err.stage || "ffmpeg",
					msg: "Transcode failed",
					code: err.code ?? null,
					signal: err.signal ?? null,
					stderrTail: err.stderr ? tail(err.stderr) : "",
				})
			);
		}

		// PYTHON
		const audioRes = await callPy(aWav);

		if (!audioRes.ok) {
			return res.status(500).json(
				diag({
					stage: "python",
					msg: "Transcription failed",
					audio: audioRes,
				})
			);
		}

		rec.audioText = audioRes.text || "";
		rec.audioIPA = audioRes.ipa || "";
		await rec.save();

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
				cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
			)
			.join("\n");

		res.setHeader("Content-Type", "text/csv");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=recording-${id}.csv`
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
		req.user && req.user.role
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
			.select("month transcription.status")
			.lean();
		const st = day?.transcription?.status;
		if (st === "queued" || st === "processing") {
			return res.status(423).json({
				msg: "This day is currently transcribing. Please wait until it finishes.",
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
				String(rec.user)
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
						err.message || err
					);
				}
			}

			if (!oids.length) {
				console.log(
					"[recordings.js] no file ObjectIds to hard-delete for recording",
					id
				);
			} else {
				console.log(
					"[recordings.js] hard-delete starting for OIDs=",
					oids.map((o) => String(o))
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
				err.message || err
			);
		}

		console.log("[recordings.js] DELETE success", id);
		return res.json({ ok: true, id });
	} catch (e) {
		console.error("[recordings.js] DELETE fatal error", e);
		return res.status(500).json({ msg: "Server error" });
	}
});

module.exports = router;
