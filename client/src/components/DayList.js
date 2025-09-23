// client/src/components/DayList.js
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

export default function DayList() {
	const { monthId } = useParams();
	const [days, setDays] = useState([]);
	const [monthName, setMonthName] = useState("");
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");

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
			<h3>{monthName || "Days"}</h3>
			{msg && <p className="message">{msg}</p>}
			{days.length === 0 ? (
				<p>No days.</p>
			) : (
				<ul>
					{days.map((d) => (
						<li key={d._id}>
							<Link to={`/days/${d._id}/check`}>
								{d.dayNumber}:{" "}
								{new Date(d.date).toLocaleDateString()}
							</Link>
						</li>
					))}{" "}
				</ul>
			)}
			<p>
				<Link to="/">← Back to Months</Link>
			</p>
		</div>
	);
}
