// client/src/pages/RecordingPage.js
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API =
	process.env.REACT_APP_API_BASE || "https://mern-deploy-docker.onrender.com";

// Which Daily Check a recording belongs to
const FIELD_OPTIONS = [
	["checkone", "u (oo)"],
	["checktwo", "a (ah)"],
	["checkthree", "i (ee)"],
	["checkfour", "s (s)"],
	["checkfive", "ʃ (sh)"],
	["checksix", "m (m)"],
	["checkseven", "n (n)"],
	["checkeight", "dʒ (j)"],
	["checknine", "z (z)"],
	["checkten", "h (h)"],
];

const DEFAULT_FIELD = "checkone";
const UNSAVED_WARNING =
	"⚠️ You have unsaved recordings. Save them before Transcribe All.";

// ------- small helpers -------
function tokenHeader() {
	const t = localStorage.getItem("token");
	return { headers: { "x-auth-token": t } };
}
function formatMs(ms) {
	if (!ms) return "—";
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	const ss = String(s % 60).padStart(2, "0");
	return `${m}:${ss}`;
}

// Helper for CSV values
function escapeCsv(value) {
	if (value == null) return '""';
	const str = String(value).replace(/"/g, '""');
	return `"${str}"`;
}

// A self-contained recorder for a single audio clip
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

	// Saved-audio playback URL (from server)
	const [audioUrl, setAudioUrl] = useState(null);

	// Local preview URL (unsaved)
	const [audioLocalUrl, setAudioLocalUrl] = useState(null);

	const audio = useSideRecorder();

	// Keep dropdown in sync with server data
	useEffect(() => {
		if (doc?.field) setField(doc.field);
	}, [doc?.field]);

	// Fetch saved audio (GridFS) when doc.audioFileId changes
	useEffect(() => {
		if (removed) return;

		let revoke = [];
		async function loadOne(fileId) {
			if (!fileId) {
				setAudioUrl(null);
				return;
			}
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
				setAudioUrl(url);
			} catch (e) {
				console.warn(
					"[RecordingCard] Failed to fetch audio",
					fileId,
					e?.response?.status
				);
				setAudioUrl(null);
			}
		}

		loadOne(doc?.audioFileId);

		return () => {
			revoke.forEach((u) => URL.revokeObjectURL(u));
		};
	}, [doc?.audioFileId, removed]);

	// When audio.blob changes, create/revoke a local object URL
	useEffect(() => {
		if (!audio.blob) {
			if (audioLocalUrl) URL.revokeObjectURL(audioLocalUrl);
			setAudioLocalUrl(null);
			return;
		}
		const url = URL.createObjectURL(audio.blob);
		setAudioLocalUrl(url);
		return () => URL.revokeObjectURL(url);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [audio.blob]);

	const hasId = !!doc?._id;

	// EARLY ESCAPE: once removed, never render again
	if (removed) return null;

	const saveUpload = async () => {
		try {
			if (!audio.blob) {
				setMsg("Please record audio first.");
				return;
			}

			const fd = new FormData();
			if (!hasId) {
				fd.append("dayId", dayId);
				fd.append("userId", userId);
			}

			fd.append("durationAudioMs", String(audio.durationMs || 0));
			fd.append("field", field || DEFAULT_FIELD);
			fd.append("audio", audio.blob, "audio.webm");

			const url = hasId
				? `${API}/api/recordings/${doc._id}/upload`
				: `${API}/api/recordings`;

			const { data } = await axios.post(url, fd, {
				...tokenHeader(),
				headers: {
					...tokenHeader().headers,
					"Content-Type": "multipart/form-data",
				},
			});

			setDoc(data);
			setMsg(hasId ? "Replaced audio." : "Upload saved.");
			audio.clear();

			// Notify parent:
			// - CREATE: pass the saved doc up so parent can insert it immediately
			// - REPLACE/DELETE: keep existing behavior
			if (!hasId) onChanged?.(data);
			else onChanged?.();

			if (!hasId && localKey) {
				onSavedLocal?.(localKey);
			}
		} catch (e) {
			console.error("[RecordingCard] saveUpload error", e);
			setMsg(e?.response?.data?.msg || "Save failed");
		}
	};

	const deleteRecording = async () => {
		// Unsaved card: just remove it from the parent's local list
		if (!doc?._id) {
			audio.clear();
			setRemoved(true);
			if (localKey) onSavedLocal?.(localKey);
			return;
		}

		const ok = window.confirm(
			"Delete this recording (audio + transcript)?"
		);
		if (!ok) return;

		const id = String(doc._id);

		// Optimistically hide this card immediately
		setRemoved(true);

		try {
			await axios.delete(`${API}/api/recordings/${id}`, tokenHeader());
			onChanged?.(id);
		} catch (e) {
			console.error("[RecordingCard] delete error", e);
			setMsg(e?.response?.data?.msg || "Delete failed");
			// If you want the card to reappear on failure:
			// setRemoved(false);
		}
	};

	const durationMs = doc?.durationAudioMs ?? audio.durationMs ?? 0;

	const hasIdNow = !!doc?._id;
	const recordLabel =
		audio.status !== "recording"
			? hasIdNow
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
					padding: 8,
					border: "1px dashed #666",
					borderRadius: 8,
				}}
			>
				<div
					style={{
						display: "flex",
						gap: 8,
						marginBottom: 6,
						flexWrap: "wrap",
					}}
				>
					{audio.status !== "recording" ? (
						<button onClick={audio.start}>{recordLabel}</button>
					) : (
						<button onClick={audio.stop}>{recordLabel}</button>
					)}

					<button onClick={audio.clear} disabled={!audio.blob}>
						Clear
					</button>

					<span>Duration: {formatMs(durationMs)}</span>
				</div>

				{/* Playback: prefer local unsaved recording, else saved file */}
				{audioLocalUrl ? (
					<audio
						controls
						src={audioLocalUrl}
						style={{ marginTop: 6, width: "100%" }}
					/>
				) : (
					doc?.audioFileId &&
					audioUrl && (
						<audio
							controls
							src={audioUrl}
							style={{ marginTop: 6, width: "100%" }}
						/>
					)
				)}

				<div style={{ marginTop: 6 }}>
					Text: {doc?.audioText ?? "—"}
				</div>
				<div>IPA: {doc?.audioIPA ?? "—"}</div>
			</div>

			<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
				<button
					onClick={saveUpload}
					disabled={!audio.blob}
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
	onTranscribingChange,
}) {
	const [params] = useSearchParams();
	const navigate = useNavigate();

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

	const [transcribing, setTranscribing] = useState(false);
	const [exportingAll, setExportingAll] = useState(false);

	const hasUnsaved = locals.length > 0;

	useEffect(() => {
		if (hasUnsaved && !transcribing) {
			setMsg((prev) => prev || UNSAVED_WARNING);
			return;
		}
		if (!hasUnsaved) {
			setMsg((prev) => (prev === UNSAVED_WARNING ? "" : prev));
		}
	}, [hasUnsaved, transcribing]);

	const hasAnyAudio = items.some((rec) => rec.audioFileId);

	const load = async () => {
		if (!dayId || !userId) return;
		try {
			setLoading(true);
			const { data } = await axios.get(
				`${API}/api/recordings/by-day?day=${dayId}&user=${userId}`,
				tokenHeader()
			);
			setItems(data || []);
		} catch (e) {
			console.error("load recordings", e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dayId, userId]);

	const addNewCard = () => {
		const key = `local-${Date.now()}`;
		setLocals((xs) => [...xs, key]);
	};

	const onSavedLocal = (localKey) => {
		setLocals((xs) => xs.filter((k) => k !== localKey));
	};

	const removeById = (id) => {
		setItems((xs) => xs.filter((x) => x._id !== id));
	};

	const transcribeAll = async () => {
		if (hasUnsaved) {
			setMsg(UNSAVED_WARNING);
			return;
		}
		if (!items.length) {
			alert("No saved recordings to transcribe.");
			return;
		}

		// Only transcribe saved recordings that actually have audio
		const idsWithAudio = items
			.filter((rec) => rec.audioFileId)
			.map((rec) => rec._id);

		if (!idsWithAudio.length) {
			alert("Please record and save audio before transcribing.");
			return;
		}

		const ok = window.confirm(
			[
				"Transcribe all saved recordings on this day?",
				"",
				"Transcription will run in the background.",
				"You will be redirected to the Day List immediately.",
				"",
				"Only do this if you are finished editing checks, comments, equipment,",
				"and recordings for this day.",
			].join("\n")
		);

		if (!ok) return;

		setTranscribing(true);
		onTranscribingChange?.(true);
		setMsg(
			"✅ Transcription will run in the background. Redirecting to Day List now..."
		);

		try {
			await axios.post(
				`${API}/api/recordings/transcribe-day`,
				{ dayId, userId },
				{ headers: { "x-auth-token": localStorage.getItem("token") } }
			);

			sessionStorage.setItem(
				"transcribeNotice",
				"✅ Transcription started in the background. This day will be locked until it finishes."
			);

			navigate(`/months/${monthId}`);
		} catch (err) {
			console.error("[RecordingPage] transcribe-day error", err);
			setTranscribing(false);
			onTranscribingChange?.(false);
			setMsg(
				err?.response?.data?.msg ||
					"Error starting background transcription. Please try again."
			);
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
			rows.push(["RecordingId", "Text", "IPA"].join(","));

			items.forEach((doc) => {
				if (!doc) return;
				const { _id, audioText, audioIPA } = doc;

				if (audioText && audioIPA) {
					rows.push(
						[
							escapeCsv(_id || ""),
							escapeCsv(audioText),
							escapeCsv(audioIPA),
						].join(",")
					);
				}
			});

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
				<button onClick={addNewCard} disabled={transcribing}>
					+ Add new recording
				</button>

				<button
					type="button"
					onClick={transcribeAll}
					disabled={!hasAnyAudio || transcribing || hasUnsaved}
				>
					{transcribing ? "Transcribing..." : "Transcribe all"}
				</button>

				<button
					type="button"
					onClick={exportAllTranscriptions}
					disabled={!items.length || exportingAll || transcribing}
				>
					{exportingAll
						? "Exporting..."
						: "Export all transcriptions"}
				</button>
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
					onChanged={(savedDoc) => {
						if (savedDoc && savedDoc._id) {
							setItems((xs) => [
								savedDoc,
								...xs.filter((x) => x._id !== savedDoc._id),
							]);
						} else {
							load();
						}
					}}
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
