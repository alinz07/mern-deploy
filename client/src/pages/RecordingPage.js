// client/src/pages/RecordingPage.js
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com";

// Which Daily Check a recording belongs to
const FIELD_OPTIONS = [
	["checkone", "Check One"],
	["checktwo", "Check Two"],
	["checkthree", "Check Three"],
	["checkfour", "Check Four"],
	["checkfive", "Check Five"],
	["checksix", "Check Six"],
	["checkseven", "Check Seven"],
	["checkeight", "Check Eight"],
	["checknine", "Check Nine"],
	["checkten", "Check Ten"],
];

const DEFAULT_FIELD = "checkone";

// ------- small helpers -------
function tokenHeader() {
	const t = localStorage.getItem("token");
	return { headers: { "x-auth-token": t } };
}
function formatMs(ms) {
	if (!ms) return "—";
	const s = Math.floor(ms / 1000); // always round DOWN
	const m = Math.floor(s / 60); // minutes
	const ss = String(s % 60).padStart(2, "0"); // seconds (00–59)
	return `${m}:${ss}`;
}

// Helper for CSV values
function escapeCsv(value) {
	if (value == null) return '""';
	const str = String(value).replace(/"/g, '""');
	return `"${str}"`;
}

// A self-contained recorder for a single side (teacher|student)
function useSideRecorder() {
	const mediaRef = useRef(null);
	const recRef = useRef(null);
	const chunksRef = useRef([]);
	const [status, setStatus] = useState("idle"); // idle|recording
	const [blob, setBlob] = useState(null);
	const [durationMs, setDurationMs] = useState(0);

	const start = async () => {
		if (status === "recording") return;
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
		});
		mediaRef.current = stream;
		const rec = new MediaRecorder(stream);
		recRef.current = rec;
		chunksRef.current = [];
		setStatus("recording");
		const started = Date.now();

		rec.ondataavailable = (e) =>
			e.data.size && chunksRef.current.push(e.data);
		rec.onstop = () => {
			const b = new Blob(chunksRef.current, { type: "audio/webm" });
			setBlob(b);
			setDurationMs(Date.now() - started);
			setStatus("idle");
			mediaRef.current?.getTracks()?.forEach((t) => t.stop());
			mediaRef.current = null;
		};
		rec.start();
	};
	const stop = () => {
		if (recRef.current && status === "recording") recRef.current.stop();
	};
	const clear = () => {
		setBlob(null);
		setDurationMs(0);
	};

	return { status, blob, durationMs, start, stop, clear };
}

// ------- a single Recording card -------
function RecordingCard({
	dayId,
	userId,
	monthId,
	initialDoc,
	onChanged,
	localKey,
	onSavedLocal,
}) {
	const [doc, setDoc] = useState(initialDoc);
	const [msg, setMsg] = useState("");
	const [removed, setRemoved] = useState(false);

	// Which Daily Check this recording is for
	const [field, setField] = useState(initialDoc?.field || DEFAULT_FIELD);

	const [teacherUrl, setTeacherUrl] = useState(null);
	const [studentUrl, setStudentUrl] = useState(null);

	useEffect(() => {
		if (removed) {
			// if we've been marked removed, don't bother fetching audio
			return;
		}
		let revoke = [];
		async function loadOne(fileId, setter) {
			if (!fileId) return;
			try {
				const res = await axios.get(
					`${API}/api/recordings/file/${fileId}`,
					{
						...tokenHeader(),
						responseType: "blob",
					}
				);
				const url = URL.createObjectURL(res.data);
				revoke.push(url);
				setter(url);
			} catch (e) {
				console.warn(
					"[RecordingCard] Failed to fetch audio",
					fileId,
					e?.response?.status
				);
				setter(null);
			}
		}
		setTeacherUrl(null);
		setStudentUrl(null);
		loadOne(doc?.teacherFileId, setTeacherUrl);
		loadOne(doc?.studentFileId, setStudentUrl);

		return () => {
			revoke.forEach((u) => URL.revokeObjectURL(u));
		};
	}, [doc?.teacherFileId, doc?.studentFileId, removed]);

	const teacher = useSideRecorder();
	const student = useSideRecorder();

	// Keep dropdown in sync with server data
	useEffect(() => {
		if (doc?.field) {
			setField(doc.field);
		}
	}, [doc?.field]);

	// Local preview URLs for unsaved recordings
	const [teacherLocalUrl, setTeacherLocalUrl] = useState(null);
	const [studentLocalUrl, setStudentLocalUrl] = useState(null);

	// When teacher.blob changes, create/revoke a local object URL
	useEffect(() => {
		if (!teacher.blob) {
			if (teacherLocalUrl) {
				URL.revokeObjectURL(teacherLocalUrl);
			}
			setTeacherLocalUrl(null);
			return;
		}
		const url = URL.createObjectURL(teacher.blob);
		setTeacherLocalUrl(url);
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [teacher.blob]); // eslint-disable-line react-hooks/exhaustive-deps

	// When student.blob changes, create/revoke a local object URL
	useEffect(() => {
		if (!student.blob) {
			if (studentLocalUrl) {
				URL.revokeObjectURL(studentLocalUrl);
			}
			setStudentLocalUrl(null);
			return;
		}
		const url = URL.createObjectURL(student.blob);
		setStudentLocalUrl(url);
		return () => {
			URL.revokeObjectURL(url);
		};
	}, [student.blob]); // eslint-disable-line react-hooks/exhaustive-deps

	const hasId = !!doc?._id;

	// EARLY ESCAPE: once removed, never render again
	if (removed) {
		console.log("[RecordingCard] render skipped because removed", {
			localKey,
			id: doc?._id,
		});
		return null;
	}

	// helper: build endpoint + form data depending on new vs replace
	const saveUpload = async () => {
		try {
			if (!teacher.blob && !student.blob) {
				setMsg("Please record teacher and/or student first.");
				return;
			}

			const fd = new FormData();
			if (!hasId) {
				// CREATE new
				fd.append("dayId", dayId);
				fd.append("userId", userId);
			}
			// durations (send on both create & replace)
			fd.append("durationTeacherMs", String(teacher.durationMs || 0));
			fd.append("durationStudentMs", String(student.durationMs || 0));

			// which Daily Check this recording belongs to
			fd.append("field", field || DEFAULT_FIELD);

			if (teacher.blob)
				fd.append("teacher", teacher.blob, "teacher.webm");
			if (student.blob)
				fd.append("student", student.blob, "student.webm");

			const url = hasId
				? `${API}/api/recordings/${doc._id}/upload` // REPLACE existing
				: `${API}/api/recordings`; // CREATE new

			console.log("[RecordingCard] saveUpload", {
				hasId,
				url,
				dayId,
				userId,
			});

			const { data } = await axios.post(url, fd, {
				...tokenHeader(),
				headers: {
					...tokenHeader().headers,
					"Content-Type": "multipart/form-data",
				},
			});

			setDoc(data);
			setMsg(hasId ? "Replaced audio." : "Upload saved.");
			teacher.clear();
			student.clear();

			// Notify parent:
			onChanged?.();
			if (!hasId && localKey) {
				console.log("[RecordingCard] saveUpload removing local", {
					localKey,
				});
				onSavedLocal?.(localKey);
			}
		} catch (e) {
			console.error("[RecordingCard] saveUpload error", e);
			setMsg(e?.response?.data?.msg || "Save failed");
		}
	};

	// const downloadCsv = async () => {
	// 	if (!doc?._id) return setMsg("Save the upload first.");
	// 	try {
	// 		const { data } = await axios.get(
	// 			`${API}/api/recordings/${doc._id}/csv`,
	// 			{ ...tokenHeader(), responseType: "blob" }
	// 		);
	// 		const url = URL.createObjectURL(data);
	// 		const a = document.createElement("a");
	// 		a.href = url;
	// 		a.download = `recording-${doc._id}.csv`;
	// 		a.click();
	// 		URL.revokeObjectURL(url);
	// 	} catch (e) {
	// 		setMsg(e?.response?.data?.msg || "CSV export failed");
	// 	}
	// };

	const deleteRecording = async () => {
		// Unsaved card: just remove it from the parent's local list
		if (!doc?._id) {
			console.log("[RecordingCard] discard unsaved card", { localKey });
			teacher.clear();
			student.clear();
			setRemoved(true);
			if (localKey) {
				onSavedLocal?.(localKey);
			}
			return;
		}

		const ok = window.confirm(
			"Delete this recording (audio + transcript)?"
		);
		if (!ok) return;

		const id = String(doc._id);
		console.log("[RecordingCard] delete confirmed", { id, localKey });

		// Optimistically hide this card immediately (bulletproof UI)
		setRemoved(true);

		try {
			console.log("[RecordingCard] delete start axios", id);
			const res = await axios.delete(
				`${API}/api/recordings/${id}`,
				tokenHeader()
			);
			console.log("[RecordingCard] delete success", {
				id,
				status: res.status,
				data: res.data,
			});

			// Tell parent which server id to remove
			onChanged?.(id);
		} catch (e) {
			console.error("[RecordingCard] delete error", e);
			setMsg(e?.response?.data?.msg || "Delete failed");

			// If you want the card to reappear on failure, uncomment:
			// setRemoved(false);
		}
	};

	const teacherDurationMs = doc?.durationTeacherMs ?? teacher.durationMs ?? 0;
	const studentDurationMs = doc?.durationStudentMs ?? student.durationMs ?? 0;

	// label shows "Record" for new cards, "Record again" for saved ones
	const hasIdNow = !!doc?._id;
	const teacherLabel =
		teacher.status !== "recording"
			? hasIdNow
				? "Record again"
				: "Record"
			: "Stop";

	const studentLabel =
		student.status !== "recording"
			? hasIdNow
				? "Record again"
				: "Record"
			: "Stop";

	console.log("[RecordingCard] render", {
		localKey,
		id: doc?._id,
		hasIdNow,
		removed,
	});

	return (
		<div
			style={{
				border: "1px solid #444",
				borderRadius: 10,
				padding: 12,
				marginBottom: 12,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					flexWrap: "wrap",
				}}
			>
				<strong>
					Recording{" "}
					{hasIdNow && doc?._id ? `#${doc._id.slice(-6)}` : "(new)"}
				</strong>

				<label style={{ fontSize: 14 }}>
					Check:&nbsp;
					<select
						value={field}
						onChange={(e) => setField(e.target.value)}
						style={{ padding: 2 }}
					>
						{FIELD_OPTIONS.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
			</div>

			<div
				style={{
					marginTop: 8,
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: 12,
				}}
			>
				{/* Teacher side */}
				<div
					style={{
						padding: 8,
						border: "1px dashed #666",
						borderRadius: 8,
					}}
				>
					<div style={{ fontWeight: 600, marginBottom: 6 }}>
						Teacher
					</div>
					<div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
						{teacher.status !== "recording" ? (
							<button onClick={teacher.start}>
								{teacherLabel}
							</button>
						) : (
							<button onClick={teacher.stop}>
								{teacherLabel}
							</button>
						)}
						<button
							onClick={teacher.clear}
							disabled={!teacher.blob}
						>
							Clear
						</button>
						<span>Duration: {formatMs(teacherDurationMs)}</span>
					</div>

					{/* Playback: prefer local unsaved recording, else saved file */}
					{teacherLocalUrl ? (
						<audio
							controls
							src={teacherLocalUrl}
							style={{ marginTop: 6, width: "100%" }}
						/>
					) : (
						doc?.teacherFileId &&
						teacherUrl && (
							<audio
								controls
								src={teacherUrl}
								style={{ marginTop: 6, width: "100%" }}
							/>
						)
					)}
					<div>Text: {doc?.teacherText ?? "—"}</div>
					<div>IPA: {doc?.teacherIPA ?? "—"}</div>
				</div>

				{/* Student side */}
				<div
					style={{
						padding: 8,
						border: "1px dashed #666",
						borderRadius: 8,
					}}
				>
					<div style={{ fontWeight: 600, marginBottom: 6 }}>
						Student
					</div>
					<div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
						{student.status !== "recording" ? (
							<button onClick={student.start}>
								{studentLabel}
							</button>
						) : (
							<button onClick={student.stop}>
								{studentLabel}
							</button>
						)}
						<button
							onClick={student.clear}
							disabled={!student.blob}
						>
							Clear
						</button>
						<span>Duration: {formatMs(studentDurationMs)}</span>
					</div>

					{/* Playback: prefer local unsaved recording, else saved file */}
					{studentLocalUrl ? (
						<audio
							controls
							src={studentLocalUrl}
							style={{ marginTop: 6, width: "100%" }}
						/>
					) : (
						doc?.studentFileId &&
						studentUrl && (
							<audio
								controls
								src={studentUrl}
								style={{ marginTop: 6, width: "100%" }}
							/>
						)
					)}
					<div>Text: {doc?.studentText ?? "—"}</div>
					<div>IPA: {doc?.studentIPA ?? "—"}</div>
				</div>
			</div>

			<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
				<button
					onClick={saveUpload}
					disabled={!teacher.blob && !student.blob}
					title={
						hasIdNow
							? "Replace audio on this record"
							: "Create a new recording"
					}
				>
					{hasIdNow ? "Save Replacement" : "Save Upload"}
				</button>

				<button
					onClick={deleteRecording}
					style={{ marginLeft: "auto" }}
				>
					{hasIdNow ? "Delete Recording" : "Discard"}
				</button>
			</div>

			{!!msg && <div style={{ marginTop: 8, opacity: 0.8 }}>{msg}</div>}
		</div>
	);
}

// -------- PAGE SHELL (list, add, refresh) --------
function RecordingPage({
	dayId: dayIdProp,
	userId: userIdProp,
	monthId: monthIdProp,
}) {
	const [params] = useSearchParams();

	const dayIdFromQuery = params.get("day");
	const userIdFromQuery = params.get("user");
	const monthIdFromQuery = params.get("month");

	// Prefer explicit props (used on CheckPage), fall back to query params
	const dayId = dayIdProp || dayIdFromQuery;
	const userId = userIdProp || userIdFromQuery;
	const monthId = monthIdProp || monthIdFromQuery;

	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [locals, setLocals] = useState([]); // unsaved placeholders
	const [msg, setMsg] = useState("");

	// loading flags for bulk actions
	const [transcribing, setTranscribing] = useState(false);
	const [exportingAll, setExportingAll] = useState(false);

	const hasAnyAudio = items.some(
		(rec) => rec.teacherFileId || rec.studentFileId
	);

	const load = async () => {
		if (!dayId || !userId) return;
		try {
			setLoading(true);
			const { data } = await axios.get(
				`${API}/api/recordings/by-day?day=${dayId}&user=${userId}`,
				tokenHeader()
			);
			console.log("[RecordingPage] load result", {
				count: data?.length || 0,
			});
			setItems(data || []);
		} catch (e) {
			console.error("load recordings", e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		console.log("[RecordingPage] useEffect load", { dayId, userId });
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dayId, userId]);

	const addNewCard = () => {
		const key = `local-${Date.now()}`;
		console.log("[RecordingPage] addNewCard", { key });
		setLocals((xs) => [...xs, key]);
	};

	const onSavedLocal = (localKey) => {
		console.log("[RecordingPage] onSavedLocal", { localKey });
		// remove the placeholder row once the server returns a saved doc
		setLocals((xs) => xs.filter((k) => k !== localKey));
	};

	const removeById = (id) => {
		console.log("[RecordingPage] removeById", { id });
		setItems((xs) => xs.filter((x) => x._id !== id));
	};

	const transcribeAll = async () => {
		if (!items.length) {
			alert("No saved recordings to transcribe.");
			return;
		}

		// Only transcribe saved recordings that actually have audio
		const idsWithAudio = items
			.filter((rec) => rec.teacherFileId || rec.studentFileId)
			.map((rec) => rec._id);

		if (!idsWithAudio.length) {
			alert("Please record and save audio before transcribing.");
			return;
		}

		const ok = window.confirm(
			[
				"Transcribe all saved recordings on this day?",
				"",
				"This can take up to ~45 seconds.",
				"After you confirm you'll be sent back to the Day List for this month.",
				"",
				"Only do this if you are finished editing checks, comments, equipment,",
				"and recordings for this day.",
			].join("\n")
		);
		if (!ok) return;

		setTranscribing(true);
		setMsg("");

		try {
			// Fire off all transcription requests
			await Promise.all(
				idsWithAudio.map((id) =>
					axios.post(
						`${API}/api/recordings/${id}/transcribe`,
						{},
						tokenHeader()
					)
				)
			);

			if (monthId) {
				// Go to DayList for this month
				window.location.href = `/months/${monthId}${
					userId ? `?userId=${userId}` : ""
				}`;
			} else {
				// Fallback if we don't know the month
				setMsg(
					"Transcription started. Refresh the Day List to see updated stats."
				);
			}
		} catch (e) {
			console.error("[RecordingPage] transcribeAll error", e);
			setMsg(
				e?.response?.data?.msg ||
					"Bulk transcribe failed or partially succeeded."
			);
		} finally {
			setTranscribing(false);
		}
	};

	const exportAllTranscriptions = () => {
		if (!items.length) {
			alert("No recordings to export.");
			return;
		}

		setExportingAll(true);

		try {
			const rows = [];
			// Header row
			rows.push(["RecordingId", "Side", "Text", "IPA"].join(","));

			items.forEach((doc) => {
				if (!doc) return;

				const {
					_id,
					teacherText,
					teacherIPA,
					studentText,
					studentIPA,
				} = doc;

				// Teacher row
				if (teacherText && teacherIPA) {
					rows.push(
						[
							escapeCsv(_id || ""),
							escapeCsv("Teacher"),
							escapeCsv(teacherText),
							escapeCsv(teacherIPA),
						].join(",")
					);
				}

				// Student row
				if (studentText && studentIPA) {
					rows.push(
						[
							escapeCsv(_id || ""),
							escapeCsv("Student"),
							escapeCsv(studentText),
							escapeCsv(studentIPA),
						].join(",")
					);
				}
			});

			// If we only have the header, nothing matched
			if (rows.length === 1) {
				alert("No transcriptions found to export.");
				return;
			}

			const csvContent = rows.join("\n");
			const blob = new Blob([csvContent], {
				type: "text/csv;charset=utf-8;",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;

			const datePart = new Date().toISOString().slice(0, 10);
			a.download = `recordings-transcriptions-${datePart}.csv`;

			a.click();
			URL.revokeObjectURL(url);
		} finally {
			setExportingAll(false);
		}
	};

	console.log("[RecordingPage] render", {
		itemsCount: items.length,
		localsCount: locals.length,
	});

	return (
		<div style={{ padding: 16 }}>
			<div
				style={{
					marginBottom: 12,
					display: "flex",
					gap: 8,
					alignItems: "center",
				}}
			>
				<button onClick={addNewCard}>+ Add new recording</button>
				<button
					type="button"
					onClick={transcribeAll}
					disabled={!hasAnyAudio || transcribing}
				>
					{transcribing ? "Transcribing..." : "Transcribe all"}
				</button>
				<button
					type="button"
					onClick={exportAllTranscriptions}
					disabled={!items.length || exportingAll}
				>
					{exportingAll
						? "Exporting..."
						: "Export all transcriptions"}
				</button>{" "}
			</div>
			{loading && <div style={{ marginTop: 12 }}>Loading…</div>}

			{msg && <div style={{ marginTop: 8, opacity: 0.8 }}>{msg}</div>}

			{/* Unsaved placeholders (locals) */}
			{locals.map((k) => (
				<RecordingCard
					key={k}
					localKey={k}
					dayId={dayId}
					userId={userId}
					monthId={monthId}
					initialDoc={null}
					onChanged={() => load()}
					onSavedLocal={onSavedLocal}
				/>
			))}

			{/* Saved recordings */}
			{items.map((doc) => (
				<RecordingCard
					key={doc._id}
					dayId={dayId}
					userId={userId}
					monthId={monthId}
					initialDoc={doc}
					onChanged={(maybeDeletedId) => {
						console.log("[RecordingPage] onChanged from card", {
							maybeDeletedId,
						});
						if (maybeDeletedId) removeById(maybeDeletedId);
						else load();
					}}
				/>
			))}

			{!loading && items.length === 0 && locals.length === 0 && (
				<div style={{ marginTop: 12, opacity: 0.8 }}>
					No recordings yet. Click “Add new recording” to start.
				</div>
			)}
		</div>
	);
}

export default RecordingPage;
