import React, { useEffect, useState } from "react";
import axios from "axios";

function DayList({ monthId }) {
	const [days, setDays] = useState([]);
	const [monthName, setMonthName] = useState("");
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");

	useEffect(() => {
		const fetchDays = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					`https://mern-deploy-i7u8.onrender.com/api/day`,
					{
						headers: { "x-auth-token": token },
						params: { monthId },
					}
				);
				setMonthName(res.data.monthName);
				setDays(res.data.days);
			} catch (err) {
				console.error(
					"Failed to fetch days:",
					err.response?.data || err.message
				);
				setMessage("Failed to load days");
			} finally {
				setLoading(false);
			}
		};

		if (monthId) fetchDays();
	}, [monthId]);

	if (!monthId) return null;
	if (loading) return <p>Loading days...</p>;
	if (message) return <p className="error">{message}</p>;

	return (
		<div className="day-list">
			<h4>Days in {monthName}</h4>
			{days.length === 0 ? (
				<p>No days yet.</p>
			) : (
				<ul>
					{days.map((d) => (
						<li key={d._id}>
							Day {d.day}
							{d.isoDate ? ` — ${d.isoDate}` : ""}
							{d.notes ? ` — ${d.notes}` : ""}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default DayList;
