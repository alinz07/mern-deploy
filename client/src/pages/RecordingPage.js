// client/src/pages/RecordingPage.js
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com";

// ------- small helpers -------
function tokenHeader() {
	const t = localStorage.getItem("token");
	return { headers: { "x-auth-token": t } };
}
function formatMs(ms) {
	if (!ms) return "—";
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
// --- inside RecordingPage.js ---
// ...imports stay the same

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

	const teacher = useSideRecorder();
	const student = useSideRecorder();

	const hasId = !!doc?._id;

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

			if (teacher.blob)
				fd.append("teacher", teacher.blob, "teacher.webm");
			if (student.blob)
				fd.append("student", student.blob, "student.webm");

			const url = hasId
				? `${API}/api/recordings/${doc._id}/upload` // REPLACE existing
				: `${API}/api/recordings`; // CREATE new

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

			// Notify parent: reload list (or remove the placeholder if it was unsaved)
			if (!hasId) onSavedLocal?.(localKey);
			onChanged?.();
		} catch (e) {
			console.error("[RecordingCard] saveUpload error", e);
			setMsg(e?.response?.data?.msg || "Save failed");
		}
	};

	const transcribe = async () => {
		if (!doc?._id) return setMsg("Save the upload first.");
		try {
			const { data } = await axios.post(
				`${API}/api/recordings/${doc._id}/transcribe`,
				{},
				tokenHeader()
			);
			setDoc(data);
			setMsg("Transcribed.");
			onChanged?.();
		} catch (e) {
			setMsg(e?.response?.data?.msg || "Transcribe failed");
		}
	};

	const downloadCsv = async () => {
		if (!doc?._id) return setMsg("Save the upload first.");
		try {
			const { data } = await axios.get(
				`${API}/api/recordings/${doc._id}/csv`,
				{ ...tokenHeader(), responseType: "blob" }
			);
			const url = URL.createObjectURL(data);
			const a = document.createElement("a");
			a.href = url;
			a.download = `recording-${doc._id}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			setMsg(e?.response?.data?.msg || "CSV export failed");
		}
	};

	const deleteRecording = async () => {
		if (!doc?._id) {
			// Unsaved placeholder: just clear locally
			teacher.clear();
			student.clear();
			setDoc(null);
			setMsg("Discarded unsaved recording.");
			onChanged?.();
			return;
		}
		const ok = window.confirm(
			"Delete this recording (audio + transcript)?"
		);
		if (!ok) return;
		try {
			await axios.delete(
				`${API}/api/recordings/${doc._id}`,
				tokenHeader()
			);
			onChanged?.(doc._id); // parent removes from list
		} catch (e) {
			setMsg(e?.response?.data?.msg || "Delete failed");
		}
	};

	const teacherDurationMs = doc?.durationTeacherMs ?? teacher.durationMs ?? 0;
	const studentDurationMs = doc?.durationStudentMs ?? student.durationMs ?? 0;

	if (!hasId && !localKey) {
		// saved item deleted -> unmount
		return null;
	}

	// label shows "Record" for new cards, "Record again" for saved ones
	const teacherLabel =
		teacher.status !== "recording"
			? hasId
				? "Record again"
				: "Record"
			: "Stop";

	const studentLabel =
		student.status !== "recording"
			? hasId
				? "Record again"
				: "Record"
			: "Stop";

	return (
		<div
			style={{
				border: "1px solid #444",
				borderRadius: 10,
				padding: 12,
				marginBottom: 12,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<strong>
					Recording {hasId ? `#${doc._id.slice(-6)}` : "(new)"}
				</strong>
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

					{/* Playback if saved */}
					{doc?.teacherFileId && (
						<audio
							controls
							src={`${API}/api/recordings/file/${doc.teacherFileId}`}
							style={{ marginTop: 6, width: "100%" }}
						/>
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

					{/* Playback if saved */}
					{doc?.studentFileId && (
						<audio
							controls
							src={`${API}/api/recordings/file/${doc.studentFileId}`}
							style={{ marginTop: 6, width: "100%" }}
						/>
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
						hasId
							? "Replace audio on this record"
							: "Create a new recording"
					}
				>
					{hasId ? "Save Replacement" : "Save Upload"}
				</button>
				<button onClick={transcribe} disabled={!hasId}>
					Transcribe to IPA
				</button>
				<button onClick={downloadCsv} disabled={!hasId}>
					Export CSV
				</button>
				<button
					onClick={deleteRecording}
					style={{ marginLeft: "auto" }}
				>
					{hasId ? "Delete Recording" : "Discard"}
				</button>
			</div>

			{!!msg && <div style={{ marginTop: 8, opacity: 0.8 }}>{msg}</div>}
		</div>
	);
}
