// client/pages/UserDetails.js
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-i7u8.onrender.com"; // matches your other files
const tokenHeader = () => ({
	headers: { "x-auth-token": localStorage.getItem("token") },
});

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
	const m = key.match(/^check(\w+)$/i);
	if (!m) return key;
	const w = m[1];
	return `Check ${w[0].toUpperCase()}${w.slice(1)}`;
}

export default function UserDetails() {
	const { userId } = useParams();
	const location = useLocation();
	const userFromState = location.state?.user || null;

	const [user, setUser] = useState(userFromState);
	const [stats, setStats] = useState(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let alive = true;

		const fetchUser = async () => {
			if (userFromState) return; // already have it from Link state
			try {
				// Try the more specific path first (if your server exposes it):
				//   GET /api/users/:id/data
				const u1 = await axios.get(
					`${API}/api/users/${userId}/data`,
					tokenHeader()
				);
				if (!alive) return;
				setUser(u1.data);
			} catch (e1) {
				try {
					// Fallback to GET /api/users/:id
					const u2 = await axios.get(
						`${API}/api/users/${userId}`,
						tokenHeader()
					);
					if (!alive) return;
					setUser(u2.data);
				} catch (e2) {
					try {
						// Last-resort: GET /api/users then find by id
						const list = await axios.get(
							`${API}/api/users`,
							tokenHeader()
						);
						if (!alive) return;
						const found = (list.data || []).find(
							(u) => String(u._id) === String(userId)
						);
						setUser(found || null);
						if (!found) setError("User not found.");
					} catch (e3) {
						if (alive) setError("Failed to load user.");
					}
				}
			}
		};

		const fetchStats = async () => {
			try {
				const s = await axios.get(
					`${API}/api/stats/user/${userId}/check-fields`,
					tokenHeader()
				);
				if (!alive) return;
				setStats(s.data);
			} catch (e) {
				if (alive) setError("Failed to load user stats.");
			}
		};

		fetchUser();
		fetchStats();

		return () => {
			alive = false;
		};
	}, [userId, userFromState]);

	const rows = useMemo(() => {
		if (!stats) return null;
		const cm = stats.currentMonth;
		const pm = stats.previousMonth;
		return CHECK_FIELDS.map((k) => {
			const cur = cm?.fields?.[k] || { pct: 0, total: 0 };
			const prv = pm?.fields?.[k] || { pct: 0, total: 0 };
			return (
				<tr key={k}>
					<td>{labelize(k)}</td>
					<td>{`${cur.pct}% out of ${cur.total}`}</td>
					<td>{`${prv.pct}% out of ${prv.total}`}</td>
				</tr>
			);
		});
	}, [stats]);

	if (error)
		return (
			<div className="container" style={{ color: "crimson" }}>
				{error}
			</div>
		);
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
					({stats.currentMonth?.name} vs {stats.previousMonth?.name})
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
