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
function RecordingCard({
	dayId,
	userId,
	monthId,
	initialDoc, // may be null for a brand-new unsaved card
	onChanged, // callback to refresh list when something persisted/deleted
}) {
	const [doc, setDoc] = useState(initialDoc); // server doc (may be null/undefined until saved)
	const [msg, setMsg] = useState("");

	const teacher = useSideRecorder();
	const student = useSideRecorder();

	// If this card represents an existing doc, we don’t auto-load its audio (GridFS streaming)
	// The UI keeps it simple: show durations when recorded now; otherwise just show text fields.

	const saveUpload = async () => {
		try {
			if (!teacher.blob && !student.blob) {
				setMsg("Please record teacher and/or student first.");
				return;
			}
			const fd = new FormData();
			fd.append("dayId", dayId);
			fd.append("userId", userId);
			fd.append("durationTeacherMs", String(teacher.durationMs || 0));
			fd.append("durationStudentMs", String(student.durationMs || 0));
			if (teacher.blob)
				fd.append("teacher", teacher.blob, "teacher.webm");
			if (student.blob)
				fd.append("student", student.blob, "student.webm");

			// For brand-new card: create new Recording document.
			// (If you ever want to support “replace on existing id”, you can post to /:id/uploads)
			const { data } = await axios.post(`${API}/api/recordings`, fd, {
				...tokenHeader(),
				headers: {
					...tokenHeader().headers,
					"Content-Type": "multipart/form-data",
				},
			});

			setDoc(data); // expect the server to return the created Recording
			setMsg("Upload saved.");
			teacher.clear();
			student.clear();
			onChanged?.();
		} catch (e) {
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
			// optimistic: update text fields if server returns them
			setDoc((d) => ({ ...d, ...data?.saved }));
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
			// brand-new unsaved card: just clear UI
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
			setDoc(null);
			setMsg("Deleted.");
			onChanged?.();
		} catch (e) {
			setMsg(e?.response?.data?.msg || "Delete failed");
		}
	};

	const hasId = !!doc?._id;

	return (
		<div
			style={{
				border: "1px solid #444",
				borderRadius: 10,
				padding: 12,
				marginBottom: 12,
			}}
		>
			{/* Header */}
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<strong>
					Recording {hasId ? `#${doc._id.slice(-6)}` : "(new)"}
				</strong>
				{monthId && (
					<Link
						to={`/check?month=${monthId}&day=${dayId}&user=${userId}`}
						style={{ marginLeft: "auto" }}
					>
						← Back to Check
					</Link>
				)}
			</div>

			{/* Controls */}
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
							<button onClick={teacher.start}>Record</button>
						) : (
							<button onClick={teacher.stop}>Stop</button>
						)}
						<button
							onClick={teacher.clear}
							disabled={!teacher.blob}
						>
							Clear
						</button>
						<span>Duration: {formatMs(teacher.durationMs)}</span>
					</div>
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
							<button onClick={student.start}>Record</button>
						) : (
							<button onClick={student.stop}>Stop</button>
						)}
						<button
							onClick={student.clear}
							disabled={!student.blob}
						>
							Clear
						</button>
						<span>Duration: {formatMs(student.durationMs)}</span>
					</div>
					<div>Text: {doc?.studentText ?? "—"}</div>
					<div>IPA: {doc?.studentIPA ?? "—"}</div>
				</div>
			</div>

			{/* Actions */}
			<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
				<button
					onClick={saveUpload}
					disabled={!teacher.blob && !student.blob}
				>
					Save Upload
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

// ------- main page (list of cards) -------
export default function RecordingPage() {
	const [params] = useSearchParams();
	const dayId = params.get("day");
	const userId = params.get("user");
	const monthId = params.get("month"); // optional back link

	const [list, setList] = useState([]); // server documents
	const [unsaved, setUnsaved] = useState([]); // local-only cards (no _id yet)
	const [msg, setMsg] = useState("");

	const load = async () => {
		try {
			const { data } = await axios.get(
				`${API}/api/recordings/by-day?day=${dayId}&user=${userId}`,
				tokenHeader()
			);
			setList(Array.isArray(data) ? data : data ? [data] : []);
		} catch (e) {
			setMsg(e?.response?.data?.msg || "Failed to load recordings");
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dayId, userId]);

	const addNewCard = () => {
		setUnsaved((arr) => [...arr, { __localKey: crypto.randomUUID() }]);
	};

	const onAnyChanged = () => {
		load();
	};

	return (
		<div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
			<h2>Recordings</h2>
			<div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
				<button onClick={addNewCard}>+ Add new recording</button>
				{monthId && (
					<Link
						to={`/check?month=${monthId}&day=${dayId}&user=${userId}`}
						style={{ marginLeft: "auto" }}
					>
						← Back to Check
					</Link>
				)}
			</div>

			{unsaved.map((u) => (
				<RecordingCard
					key={u.__localKey}
					dayId={dayId}
					userId={userId}
					monthId={monthId}
					initialDoc={null}
					onChanged={onAnyChanged}
				/>
			))}

			{list.map((doc) => (
				<RecordingCard
					key={doc._id}
					dayId={dayId}
					userId={userId}
					monthId={monthId}
					initialDoc={doc}
					onChanged={onAnyChanged}
				/>
			))}

			{!!msg && (
				<div style={{ marginTop: 12, color: "salmon" }}>{msg}</div>
			)}
		</div>
	);
}
