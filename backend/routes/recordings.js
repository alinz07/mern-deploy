// backend/routes/recordings.js
const router = require("express").Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const auth = require("../middleware/auth");

const Recording = require("../models/Recording");
const Day = require("../models/Day");

// ---- storage helpers ----
function getBucket() {
	return new GridFSBucket(mongoose.connection.db, { bucketName: "audio" });
}
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 30 * 1024 * 1024 },
}); // 30MB per clip

// POST /api/recordings  (create or replace audio for a day)
// form-data: dayId, userId (student), teacher (file), student (file), durationTeacherMs?, durationStudentMs?
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

			// upsert by (day,user)
			const doc = await Recording.findOneAndUpdate(
				{ day: dayId, user: userId },
				{
					$set: {
						...(teacherFileId ? { teacherFileId } : {}),
						...(studentFileId ? { studentFileId } : {}),
						...(durationTeacherMs
							? { durationTeacherMs: Number(durationTeacherMs) }
							: {}),
						...(durationStudentMs
							? { durationStudentMs: Number(durationStudentMs) }
							: {}),
					},
				},
				{ new: true, upsert: true }
			);

			return res.json(doc);
		} catch (e) {
			console.error("POST /api/recordings error", e);
			return res.status(500).json({ msg: "Server error" });
		}
	}
);

// GET /api/recordings/by-day?day=<dayId>&user=<userId>
router.get("/by-day", auth, async (req, res) => {
	try {
		const { day, user } = req.query;
		if (!mongoose.isValidObjectId(day) || !mongoose.isValidObjectId(user)) {
			return res.status(400).json({ msg: "Invalid ids" });
		}
		if (req.user.role !== "admin" && req.user.id !== user) {
			return res.status(403).json({ msg: "Forbidden" });
		}
		const doc = await Recording.findOne({ day, user }).lean();
		res.json(doc || null);
	} catch {
		res.status(500).json({ msg: "Server error" });
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

// POST /api/recordings/:id/transcribe   (run faster-whisper -> phonemizer; save IPA + text)
router.post("/:id/transcribe", auth, async (req, res) => {
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

		async function dump(fileId) {
			return new Promise((resolve, reject) => {
				if (!fileId) return resolve(null);
				const file = path.join(os.tmpdir(), `${fileId}.webm`);
				const ws = fs.createWriteStream(file);
				bucket
					.openDownloadStream(fileId)
					.on("error", reject)
					.pipe(ws)
					.on("finish", () => resolve(file));
			});
		}

		// Transcode webm -> 16k mono wav (dramatically lowers memory use)
		async function toWav16kMono(inputPath) {
			if (!inputPath) return null;
			const out = inputPath.replace(/\.webm$/i, ".wav");
			await new Promise((resolve, reject) => {
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
				ff.on("close", (code) =>
					code === 0 ? resolve() : reject(new Error("ffmpeg failed"))
				);
			});
			return out;
		}

		// Call Python helper
		function callPy(inputPath) {
			return new Promise((resolve) => {
				if (!inputPath) return resolve({ text: "", ipa: "" });
				const child = spawn(
					"python3",
					[path.join(__dirname, "../utils/transcribe.py"), inputPath],
					{ stdio: ["ignore", "pipe", "pipe"] }
				);
				let out = "";
				let err = "";
				child.stdout.on("data", (d) => (out += d.toString()));
				child.stderr.on("data", (d) => (err += d.toString()));
				child.on("close", () => {
					try {
						resolve(JSON.parse(out));
					} catch {
						resolve({ text: "", ipa: "", err });
					}
				});
			});
		}

		const tPath = await dump(rec.teacherFileId);
		const sPath = await dump(rec.studentFileId);
		const [tWav, sWav] = await Promise.all([
			toWav16kMono(tPath),
			toWav16kMono(sPath),
		]);

		const [teacherRes, studentRes] = await Promise.all([
			callPy(tWav),
			callPy(sWav),
		]);

		rec.teacherText = teacherRes.text || "";
		rec.teacherIPA = teacherRes.ipa || "";
		rec.studentText = studentRes.text || "";
		rec.studentIPA = studentRes.ipa || "";
		await rec.save();

		res.json(rec);
	} catch (e) {
		console.error("POST /api/recordings/:id/transcribe error", e);
		res.status(500).json({ msg: "Transcription failed" });
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

module.exports = router;
