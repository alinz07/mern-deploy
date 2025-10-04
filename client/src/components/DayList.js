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
				// monthRes returns the raw doc; userId is an ObjectId string
				setMonthOwnerId(monthRes.data?.userId || null);
			} catch (e) {
				setMsg("Failed to load days");
			} finally {
				setLoading(false);
			}
		};
		if (monthId) load();
	}, [monthId]);

	// compute min/max for the date input so it's constrained to this month
	const dateBounds = useMemo(() => {
		if (!monthName) return { min: undefined, max: undefined };
		const [mName, yStr] = (monthName || "").split(" ");
		const y = Number(yStr);
		const tmp = new Date(`${mName} 1, ${y}`);
		if (isNaN(tmp)) return { min: undefined, max: undefined };
		const first = new Date(tmp.getFullYear(), tmp.getMonth(), 1);
		const last = new Date(tmp.getFullYear(), tmp.getMonth() + 1, 0);
		const toISO = (d) => d.toISOString().slice(0, 10);
		return { min: toISO(first), max: toISO(last) };
	}, [monthName]);

	const createDay = async (dayNumber) => {
		if (!monthId || !dayNumber) return;
		setSubmitting(true);
		setMsg("");
		try {
			const body = {
				monthId,
				dayNumber,
				environment: env,
				// Always include owner; backend will ignore for non-admins
				userId: monthOwnerId,
			};
			await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/days/add",
				body,
				tokenHeader()
			);
			// refresh
			const res = await axios.get(
				`https://mern-deploy-i7u8.onrender.com/api/days?monthId=${monthId}`,
				tokenHeader()
			);
			setDays(res.data || []);
			setMsg(`Added day ${dayNumber} (${env}).`);
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

	const handleAddToday = async () => {
		if (!monthId) return;
		setSubmitting(true);
		setMsg("");
		try {
			await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/days/add-today",
				{
					monthId,
					environment: env,
					userId: monthOwnerId, // safe to include for both roles
				},
				tokenHeader()
			);
			const res = await axios.get(
				`https://mern-deploy-i7u8.onrender.com/api/days?monthId=${monthId}`,
				tokenHeader()
			);
			setDays(res.data || []);
			setMsg(`Added today (${env}).`);
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
		// Parse selected date's day number
		const d = new Date(dateStr);
		if (isNaN(d)) {
			setMsg("Invalid date");
			return;
		}
		const [mName, yStr] = monthName.split(" ");
		const sameMonth =
			d.toLocaleString("default", { month: "long" }) === mName &&
			d.getFullYear().toString() === yStr;
		if (!sameMonth) {
			setMsg(`Please pick a date in ${monthName}.`);
			return;
		}
		createDay(d.getDate());
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
