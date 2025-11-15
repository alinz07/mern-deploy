// backend/routes/recordings.js
const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFSBucket, ObjectId } = require("mongodb");
const auth = require("../middleware/auth");

const Recording = require("../models/Recording");
const Day = require("../models/Day");

console.log("[recordings.js] routes module loaded");

// ---- storage helpers ----
function getBucket() {
	return new GridFSBucket(mongoose.connection.db, { bucketName: "audio" });
}
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 30 * 1024 * 1024 },
}); // 30MB per clip

// POST /api/recordings  (create or replace audio for a day)
router.post(
	"/",
	auth,
	upload.fields([{ name: "teacher" }, { name: "student" }]),
	async (req, res) => {
		try {
			const { dayId, userId, durationTeacherMs, durationStudentMs } =
				req.body;
			if (
				!mongoose.isValidObjectId(dayId) ||
				!mongoose.isValidObjectId(userId)
			) {
				return res.status(400).json({ msg: "Invalid ids" });
			}

			// permissions: must be the student themself OR an admin in same tenant
			if (req.user.role !== "admin" && req.user.id !== userId) {
				return res.status(403).json({ msg: "Forbidden" });
			}

			const day = await Day.findById(dayId).lean();
			if (!day) return res.status(404).json({ msg: "Day not found" });
			if (String(day.userId) !== String(userId))
				return res.status(400).json({ msg: "Day/user mismatch" });

			const bucket = getBucket();

			// write files to GridFS if provided
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

			const teacherFile = req.files?.teacher?.[0] || null;
			const studentFile = req.files?.student?.[0] || null;

			const [teacherFileId, studentFileId] = await Promise.all([
				saveOne(teacherFile),
				saveOne(studentFile),
			]);

			// create a brand-new Recording every POST
			const rec = await Recording.create({
				day: dayId,
				user: userId,
				...(teacherFileId ? { teacherFileId } : {}),
				...(studentFileId ? { studentFileId } : {}),
				...(req.body.durationTeacherMs
					? { durationTeacherMs: Number(req.body.durationTeacherMs) }
					: {}),
				...(req.body.durationStudentMs
					? { durationStudentMs: Number(req.body.durationStudentMs) }
					: {}),
			});
			return res.json(rec);
		} catch (e) {
			console.error("POST /api/recordings error", e);
			return res.status(500).json({ msg: "Server error" });
		}
	}
);

// (inside backend/routes/recordings.js)
router.get("/by-day", auth, async (req, res) => {
	try {
		const { day, user } = req.query;
		if (!mongoose.isValidObjectId(day) || !mongoose.isValidObjectId(user)) {
			return res.status(400).json({ msg: "Invalid query params" });
		}

		// tenant/permission as you already do elsewhere:
		// - allow owner (req.user.id === user)
		// - allow same-tenant admin
		// (Reuse your Day->Month tenant checks if needed.)

		const list = await Recording.find({ day, user })
			.sort({ createdAt: -1 })
			.lean();

		return res.json(list);
	} catch (e) {
		console.error("GET /recordings/by-day error", e);
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
// Replace teacher and/or student audio on an existing Recording.
// Also updates durationTeacherMs / durationStudentMs if provided.
router.post(
	"/:id/upload",
	auth,
	upload.fields([{ name: "teacher" }, { name: "student" }]),
	async (req, res) => {
		try {
			const { id } = req.params;
			if (!mongoose.isValidObjectId(id)) {
				return res.status(400).json({ msg: "Invalid id" });
			}

			const rec = await Recording.findById(id);
			if (!rec)
				return res.status(404).json({ msg: "Recording not found" });

			// Permissions: owner or admin (match your other routes)
			if (
				req.user.role !== "admin" &&
				String(rec.user) !== String(req.user.id)
			) {
				return res.status(403).json({ msg: "Forbidden" });
			}

			const bucket = getBucket();

			// tiny helper to delete old file (best-effort) and upload a new one
			const replaceOne = async (oldId, file, defaultName) => {
				if (!file) return oldId; // nothing to replace
				// 1) best-effort delete old gridfs file
				if (oldId) {
					try {
						await new Promise((resolve) => {
							bucket.delete(
								typeof oldId === "string"
									? new mongoose.Types.ObjectId(oldId)
									: oldId,
								() => resolve()
							);
						});
					} catch (err) {
						console.error(
							"[recordings/:id/upload] GridFS delete error",
							String(oldId),
							err?.message || err
						);
					}
				}
				// 2) upload new file, return its id
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
				return stream.id;
			};

			const teacherFile = req.files?.teacher?.[0] || null;
			const studentFile = req.files?.student?.[0] || null;

			// replace whichever sides were provided
			rec.teacherFileId = await replaceOne(
				rec.teacherFileId,
				teacherFile,
				"teacher.webm"
			);
			rec.studentFileId = await replaceOne(
				rec.studentFileId,
				studentFile,
				"student.webm"
			);

			// optional durations from client
			if (req.body.durationTeacherMs) {
				rec.durationTeacherMs = Number(req.body.durationTeacherMs);
			}
			if (req.body.durationStudentMs) {
				rec.durationStudentMs = Number(req.body.durationStudentMs);
			}

			await rec.save();
			return res.json(rec);
		} catch (e) {
			console.error("POST /api/recordings/:id/upload error", e);
			return res.status(500).json({ msg: "Server error" });
		}
	}
);

// POST /api/:id/transcribe   (run faster-whisper -> phonemizer; save IPA + text)
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

		// Transcode webm -> 16k mono wav (dramatically lowers memory use)
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

		// Call Python helper and capture diagnostics
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
					// Detect likely OOM: SIGKILL or exit code 137
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

		let tPath, sPath, tWav, sWav, teacherRes, studentRes;

		// DUMP
		try {
			tPath = await dump(rec.teacherFileId);
			sPath = await dump(rec.studentFileId);
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
			[tWav, sWav] = await Promise.all([
				toWav16kMono(tPath),
				toWav16kMono(sPath),
			]);
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
		teacherRes = await callPy(tWav);
		studentRes = await callPy(sWav);

		if (!teacherRes.ok || !studentRes.ok) {
			// Return rich diagnostics to the client
			return res.status(500).json(
				diag({
					stage: "python",
					msg: "Transcription failed",
					teacher: teacherRes,
					student: studentRes,
				})
			);
		}

		rec.teacherText = teacherRes.text || "";
		rec.teacherIPA = teacherRes.ipa || "";
		rec.studentText = studentRes.text || "";
		rec.studentIPA = studentRes.ipa || "";
		await rec.save();

		res.json(rec);
	} catch (e) {
		console.error("POST /api/recordings/:id/transcribe error", e);
		res.status(500).json({
			...diag({
				stage: "node-catch",
				msg: "Unhandled error in transcribe route",
			}),
			error: String(e),
		});
	}
});

// GET /api/recordings/:id/csv   (CSV export for Excel)
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
			["teacher", r.teacherText || "", r.teacherIPA || ""],
			["student", r.studentText || "", r.studentIPA || ""],
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
			teacherFileId: rec.teacherFileId ? String(rec.teacherFileId) : null,
			studentFileId: rec.studentFileId ? String(rec.studentFileId) : null,
			teacherType: rec.teacherFileId && typeof rec.teacherFileId,
			studentType: rec.studentFileId && typeof rec.studentFileId,
		});

		// Delete doc first
		await Recording.deleteOne({ _id: id });
		console.log("[recordings.js] doc deleted", id);

		// Best-effort GridFS cleanup
		try {
			const bucket = getBucket();

			const fileEntries = [
				{ role: "teacher", id: rec.teacherFileId },
				{ role: "student", id: rec.studentFileId },
			].filter((x) => x.id);

			console.log(
				"[recordings.js] attempting GridFS delete for fileIds=",
				fileEntries.map((f) => ({
					role: f.role,
					id: String(f.id),
					type: typeof f.id,
				}))
			);

			for (const entry of fileEntries) {
				const { role, id: fid } = entry;
				console.log("[recordings.js] delete loop start", {
					role,
					rawId: String(fid),
					type: typeof fid,
				});

				let oid;
				try {
					// Always convert using the MongoDB driver's ObjectId
					oid =
						fid instanceof ObjectId
							? fid
							: new ObjectId(String(fid));
				} catch (err) {
					console.error(
						"[recordings.js] ObjectId conversion error for",
						role,
						"raw=",
						fid,
						"error=",
						err.message || err
					);
					continue; // skip to next file instead of killing the loop
				}

				// Check presence before delete for debugging
				try {
					const arr = await bucket.find({ _id: oid }).toArray();
					console.log(
						"[recordings.js] pre-delete presence",
						role,
						String(oid),
						"=>",
						arr.length ? "present" : "missing",
						"(count=" + arr.length + ")"
					);
				} catch (err) {
					console.error(
						"[recordings.js] presence check error",
						role,
						String(oid),
						err.message || err
					);
				}

				// Now actually delete
				await new Promise((resolve) => {
					bucket.delete(oid, (err) => {
						if (err) {
							console.error(
								"[recordings.js] GridFS delete error",
								role,
								String(oid),
								err.message
							);
						} else {
							console.log(
								"[recordings.js] GridFS delete OK",
								role,
								String(oid)
							);
						}
						resolve();
					});
				});
			}
		} catch (err) {
			console.error(
				"[recordings.js] GridFS delete setup error",
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
