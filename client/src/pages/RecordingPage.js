// client/src/pages/RecordingPage.js
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-i7u8.onrender.com";

export default function RecordingPage() {
	const [params] = useSearchParams();
	const dayId = params.get("day");
	const userId = params.get("user");
	const monthId = params.get("month"); // optional for back link

	// media
	const [recState, setRecState] = useState({ who: "", status: "idle" }); // who: teacher|student
	const mediaRef = useRef(null);
	const chunksRef = useRef([]);
	const recRef = useRef(null);
	const [durations, setDurations] = useState({ teacher: 0, student: 0 });

	const [teacherBlob, setTeacherBlob] = useState(null);
	const [studentBlob, setStudentBlob] = useState(null);

	const [recordingDoc, setRecordingDoc] = useState(null);
	const [msg, setMsg] = useState("");

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	useEffect(() => {
		// fetch an existing recording if any
		const run = async () => {
			if (!dayId || !userId) return;
			try {
				const r = await axios.get(`${API}/api/recordings/by-day`, {
					params: { day: dayId, user: userId },
					...tokenHeader(),
				});
				setRecordingDoc(r.data || null);
			} catch {
				setRecordingDoc(null);
			}
		};
		run();
	}, [dayId, userId]);

	async function start(kind) {
		setMsg("");
		chunksRef.current = [];
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
		});
		mediaRef.current = stream;
		const rec = new MediaRecorder(stream);
		recRef.current = rec;
		setRecState({ who: kind, status: "recording" });

		const startedAt = Date.now();
		rec.ondataavailable = (e) =>
			e.data.size && chunksRef.current.push(e.data);
		rec.onstop = () => {
			const blob = new Blob(chunksRef.current, { type: "audio/webm" });
			const dur = Date.now() - startedAt;
			if (kind === "teacher") {
				setTeacherBlob(blob);
				setDurations((d) => ({ ...d, teacher: dur }));
			} else {
				setStudentBlob(blob);
				setDurations((d) => ({ ...d, student: dur }));
			}
			if (mediaRef.current)
				mediaRef.current.getTracks().forEach((t) => t.stop());
			setRecState({ who: "", status: "idle" });
		};
		rec.start();
	}
	function stop() {
		if (recRef.current && recRef.current.state !== "inactive")
			recRef.current.stop();
	}

	async function upload() {
		if (!dayId || !userId) return;
		const fd = new FormData();
		fd.append("dayId", dayId);
		fd.append("userId", userId);
		if (teacherBlob) fd.append("teacher", teacherBlob, "teacher.webm");
		if (studentBlob) fd.append("student", studentBlob, "student.webm");
		if (durations.teacher)
			fd.append("durationTeacherMs", String(durations.teacher));
		if (durations.student)
			fd.append("durationStudentMs", String(durations.student));

		try {
			const r = await axios.post(`${API}/api/recordings`, fd, {
				headers: { "x-auth-token": localStorage.getItem("token") },
			});
			setRecordingDoc(r.data);
			setMsg("Upload saved.");
		} catch (e) {
			setMsg(e?.response?.data?.msg || "Upload failed");
		}
	}

	async function transcribe() {
		if (!recordingDoc?._id) return;
		try {
			const r = await axios.post(
				`${API}/api/recordings/${recordingDoc._id}/transcribe`,
				{},
				tokenHeader()
			);
			setRecordingDoc(r.data);
			setMsg("Transcription complete.");
		} catch {
			setMsg("Transcription failed.");
		}
	}

	function downloadCsv() {
		if (!recordingDoc?._id) return;
		window.location.href = `${API}/api/recordings/${recordingDoc._id}/csv`;
	}

	return (
		<div style={{ maxWidth: 820 }}>
			<p style={{ marginBottom: 8 }}>
				<Link
					to={
						monthId
							? `/days/${dayId}/check?userId=${userId}&monthId=${monthId}`
							: `/days/${dayId}/check?userId=${userId}`
					}
				>
					← Back to Check
				</Link>
			</p>

			<h2>Recording</h2>
			<p className="muted" style={{ marginTop: -6 }}>
				Record a clip from the teacher and the student, then transcribe
				to IPA.
			</p>
			{msg && <p style={{ color: "teal" }}>{msg}</p>}

			<div className="card" style={{ padding: 12 }}>
				<h3>Teacher</h3>
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					{recState.status !== "recording" ? (
						<button
							onClick={() => start("teacher")}
							disabled={recState.status === "recording"}
						>
							Start
						</button>
					) : recState.who === "teacher" ? (
						<button onClick={stop}>Stop</button>
					) : (
						<button disabled>Start</button>
					)}
					{teacherBlob && (
						<audio
							controls
							src={URL.createObjectURL(teacherBlob)}
						/>
					)}
					{durations.teacher > 0 && (
						<span className="muted">
							{Math.round(durations.teacher / 1000)}s
						</span>
					)}
				</div>
			</div>

			<div className="sp-12" />

			<div className="card" style={{ padding: 12 }}>
				<h3>Student</h3>
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					{recState.status !== "recording" ? (
						<button
							onClick={() => start("student")}
							disabled={recState.status === "recording"}
						>
							Start
						</button>
					) : recState.who === "student" ? (
						<button onClick={stop}>Stop</button>
					) : (
						<button disabled>Start</button>
					)}
					{studentBlob && (
						<audio
							controls
							src={URL.createObjectURL(studentBlob)}
						/>
					)}
					{durations.student > 0 && (
						<span className="muted">
							{Math.round(durations.student / 1000)}s
						</span>
					)}
				</div>
			</div>

			<div className="sp-12" />

			<div style={{ display: "flex", gap: 8 }}>
				<button
					onClick={upload}
					disabled={!teacherBlob && !studentBlob}
				>
					Save Upload
				</button>
				<button onClick={transcribe} disabled={!recordingDoc?._id}>
					Transcribe to IPA
				</button>
				<button onClick={downloadCsv} disabled={!recordingDoc?._id}>
					Export CSV
				</button>
			</div>

			{recordingDoc && (
				<>
					<div className="sp-16" />
					<h3>Results</h3>
					<table>
						<thead>
							<tr>
								<th>Role</th>
								<th>Text</th>
								<th>IPA</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>Teacher</td>
								<td>{recordingDoc.teacherText || "—"}</td>
								<td>{recordingDoc.teacherIPA || "—"}</td>
							</tr>
							<tr>
								<td>Student</td>
								<td>{recordingDoc.studentText || "—"}</td>
								<td>{recordingDoc.studentIPA || "—"}</td>
							</tr>
						</tbody>
					</table>
				</>
			)}
		</div>
	);
}
