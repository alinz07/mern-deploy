// client/src/components/UserDetails.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

const API_BASE = "https://mern-deploy-i7u8.onrender.com"; // matches your App.js style

const CHECK_FIELDS = [
	"checkone",
	"checktwo",
	"checkthree",
	"checkfour",
	"checkfive",
	"checksix",
	"checkseven",
	"checkeight",
	"checknine",
	"checkten",
];

function labelize(key) {
	// "checkone" -> "Check One"
	const m = key.match(/^check(\w+)$/i);
	if (!m) return key;
	const w = m[1];
	return `Check ${w[0].toUpperCase()}${w.slice(1)}`;
}

export default function UserDetails() {
	const { userId } = useParams();
	const [user, setUser] = useState(null);
	const [stats, setStats] = useState(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let alive = true;
		(async () => {
			try {
				// 1) user (for the header)
				const u = await axios.get(`${API_BASE}/api/users/${userId}`);
				if (!alive) return;
				setUser(u.data);

				// 2) per-field stats (current vs previous month)
				const s = await axios.get(
					`${API_BASE}/api/stats/user/${userId}/check-fields`
				);
				if (!alive) return;
				setStats(s.data);
			} catch (e) {
				console.error(e);
				if (alive) setError("Failed to load user details.");
			}
		})();
		return () => {
			alive = false;
		};
	}, [userId]);

	const rows = useMemo(() => {
		if (!stats) return null;
		const cm = stats.currentMonth;
		const pm = stats.previousMonth;
		return CHECK_FIELDS.map((k) => {
			const cur = cm.fields[k] || { pct: 0, total: 0 };
			const prv = pm.fields[k] || { pct: 0, total: 0 };
			return (
				<tr key={k}>
					<td>{labelize(k)}</td>
					<td>{`${cur.pct}% out of ${cur.total}`}</td>
					<td>{`${prv.pct}% out of ${prv.total}`}</td>
				</tr>
			);
		});
	}, [stats]);

	if (error) return <div className="container">{error}</div>;
	if (!user || !stats) return <div className="container">Loading…</div>;

	return (
		<div className="container">
			<div style={{ marginBottom: 16 }}>
				<Link to="/admin">← Back to Admin Dashboard</Link>
			</div>

			<h2>User Details</h2>
			<p>
				<strong>Username:</strong> {user.username}
			</p>
			{user.email && (
				<p>
					<strong>Email:</strong> {user.email}
				</p>
			)}

			<h3 style={{ marginTop: 24 }}>
				Check Field Success{" "}
				<small>
					({stats.currentMonth.name} vs {stats.previousMonth.name})
				</small>
			</h3>

			<table className="table">
				<thead>
					<tr>
						<th>Field</th>
						<th>Current Month</th>
						<th>Previous Month</th>
					</tr>
				</thead>
				<tbody>{rows}</tbody>
			</table>
		</div>
	);
}
