// client/src/components/DayList.js  (DROP-IN)
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

export default function DayList() {
	const { monthId } = useParams();

	const [days, setDays] = useState([]);
	const [monthName, setMonthName] = useState("");
	const [monthOwnerId, setMonthOwnerId] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");

	// controls for adding a day
	const [env, setEnv] = useState("online");
	const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
	const [submitting, setSubmitting] = useState(false);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	// helper: "Mon 9/1"
	const formatDayLabel = (monthName, dayNumber) => {
		if (!monthName) return String(dayNumber);
		const [mName, yStr] = monthName.split(" ");
		const d = new Date(`${mName} ${dayNumber}, ${yStr}`);
		if (isNaN(d)) return String(dayNumber);
		const wk = d.toLocaleDateString(undefined, { weekday: "short" });
		const md = d.toLocaleDateString(undefined, {
			month: "numeric",
			day: "numeric",
		});
		return `${wk} ${md}`;
	};

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			try {
				const [daysRes, monthRes] = await Promise.all([
					axios.get(
						`https://mern-deploy-i7u8.onrender.com/api/days?monthId=${monthId}`,
						tokenHeader()
					),
					axios.get(
						`https://mern-deploy-i7u8.onrender.com/api/months/${monthId}`,
						tokenHeader()
					),
				]);
				setDays(daysRes.data || []);
				setMonthName(monthRes.data?.name || "");
				setMonthOwnerId(monthRes.data?.userId || null);
			} catch (e) {
				setMsg("Failed to load days");
			} finally {
				setLoading(false);
			}
		};
		if (monthId) load();
	}, [monthId]);

	// compute min/max strings for the date input (no UTC conversion)
	const dateBounds = useMemo(() => {
		if (!monthName) return { min: undefined, max: undefined };
		const [mName, yStr] = (monthName || "").split(" ");
		const y = Number(yStr);
		const monthIndex = new Date(`${mName} 1, ${y}`).getMonth(); // safe
		const first = new Date(y, monthIndex, 1);
		const last = new Date(y, monthIndex + 1, 0);

		const pad = (n) => String(n).padStart(2, "0");
		const toYMD = (d) =>
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

		return { min: toYMD(first), max: toYMD(last) };
	}, [monthName]);

	const refreshDays = async () => {
		const res = await axios.get(
			`https://mern-deploy-i7u8.onrender.com/api/days?monthId=${monthId}`,
			tokenHeader()
		);
		setDays(res.data || []);
	};

	const createDay = async (dayNumber) => {
		if (!monthId || !dayNumber) return;
		setSubmitting(true);
		setMsg("");
		try {
			const body = {
				monthId,
				dayNumber,
				environment: env,
				userId: monthOwnerId, // safe to include; ignored for non-admins
			};
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/days/add",
				body,
				tokenHeader()
			);
			await refreshDays();
			const action = res.data?.action;
			if (action === "updated") {
				setMsg("Existing day updated.");
			} else {
				setMsg(`Added day ${dayNumber} (${env}).`);
			}
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to add day";
			setMsg(m);
		} finally {
			setSubmitting(false);
		}
	};

	// ...same imports & state as your current file...

	const handleAddToday = async () => {
		if (!monthId) return;
		setSubmitting(true);
		setMsg("");
		try {
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/days/add-today",
				{ monthId, environment: env, userId: monthOwnerId },
				tokenHeader()
			);
			await refreshDays();
			const action = res.data?.action;
			if (action === "exists") {
				setMsg("Today already exists.");
			} else if (action === "updated") {
				setMsg("Existing day updated.");
			} else {
				setMsg(`Added today (${env}).`);
			}
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to add today";
			setMsg(m);
		} finally {
			setSubmitting(false);
		}
	};

	const onSubmitAddDay = (e) => {
		e.preventDefault();
		if (!dateStr || !monthName) return;

		// Parse YYYY-MM-DD WITHOUT UTC shift
		const [yyyy, mm, dd] = dateStr.split("-").map((s) => parseInt(s, 10));
		if (!yyyy || !mm || !dd) {
			setMsg("Invalid date");
			return;
		}

		const [mName, yStr] = monthName.split(" ");
		const monthIndex = new Date(`${mName} 1, ${yStr}`).getMonth();
		const selected = new Date(yyyy, mm - 1, dd); // local time construction

		const sameMonth =
			selected.getMonth() === monthIndex &&
			selected.getFullYear().toString() === yStr;
		if (!sameMonth) {
			setMsg(`Please pick a date in ${monthName}.`);
			return;
		}
		createDay(dd);
	};

	if (loading) return <p>Loading days…</p>;

	return (
		<div className="day-list">
			<p>
				<Link to="/">← Back to Months</Link>
			</p>
			<h3>{monthName || "Days"}</h3>
			{msg && <p className="message">{msg}</p>}

			{/* Add Day Controls */}
			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 12,
					alignItems: "center",
					margin: "12px 0 16px",
				}}
			>
				<form
					onSubmit={onSubmitAddDay}
					style={{ display: "flex", gap: 8, alignItems: "center" }}
				>
					<label style={{ fontWeight: 600 }}>Add a day:</label>
					<input
						type="date"
						value={dateStr}
						onChange={(e) => setDateStr(e.target.value)}
						min={dateBounds.min}
						max={dateBounds.max}
						required
						disabled={submitting || !monthName}
					/>
					<select
						value={env}
						onChange={(e) => setEnv(e.target.value)}
						disabled={submitting}
					>
						<option value="online">online</option>
						<option value="inperson">inperson</option>
					</select>
					<button type="submit" disabled={submitting}>
						Add Day
					</button>
				</form>

				<span style={{ opacity: 0.6 }}>or</span>

				<button
					type="button"
					onClick={handleAddToday}
					disabled={submitting}
				>
					Add Today
				</button>
			</div>

			{/* Days list */}
			{days.length === 0 ? (
				<p>No days.</p>
			) : (
				<ul>
					{[...days]
						.sort((a, b) => a.dayNumber - b.dayNumber)
						.map((d) => (
							<li key={d._id}>
								<Link
									to={`/days/${d._id}/check?monthId=${monthId}&userId=${d.userId}`}
								>
									{d.dayNumber}:{" "}
									{formatDayLabel(monthName, d.dayNumber)}
								</Link>
								<span
									style={{
										marginLeft: 8,
										opacity: 0.75,
										fontSize: 12,
									}}
								>
									[{d.environment || "online"}]
								</span>
							</li>
						))}
				</ul>
			)}
		</div>
	);
}
