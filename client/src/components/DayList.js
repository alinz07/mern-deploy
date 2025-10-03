// DayList.js (DROP-IN)
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

export default function DayList() {
	const { monthId } = useParams();
	const [days, setDays] = useState([]);
	const [monthName, setMonthName] = useState("");
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");

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
		const token = localStorage.getItem("token");
		const load = async () => {
			try {
				const [daysRes, monthRes] = await Promise.all([
					axios.get(
						`https://mern-deploy-i7u8.onrender.com/api/days?monthId=${monthId}`,
						{ headers: { "x-auth-token": token } }
					),
					axios.get(
						`https://mern-deploy-i7u8.onrender.com/api/months/${monthId}`,
						{ headers: { "x-auth-token": token } }
					),
				]);
				setDays(daysRes.data);
				setMonthName(monthRes.data?.name || "");
			} catch (e) {
				setMsg("Failed to load days");
			} finally {
				setLoading(false);
			}
		};
		if (monthId) load();
	}, [monthId]);

	if (loading) return <p>Loading days…</p>;

	return (
		<div className="day-list">
			<p>
				<Link to="/">← Back to Months</Link>
			</p>
			<h3>{monthName || "Days"}</h3>
			{msg && <p className="message">{msg}</p>}
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
							</li>
						))}
				</ul>
			)}
		</div>
	);
}
