// client/pages/UserDetails.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-i7u8.onrender.com"; // matches your pattern
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
	const [commentsMap, setCommentsMap] = useState(null); // { field: [{dayNumber, commentText}], ...}
	const [open, setOpen] = useState({}); // which field is expanded
	const [error, setError] = useState("");

	// toggle “expand all comments” for a field
	const toggle = useCallback((field) => {
		setOpen((p) => ({ ...p, [field]: !p[field] }));
	}, []);

	useEffect(() => {
		let alive = true;

		const fetchUser = async () => {
			if (userFromState) return;
			try {
				const u1 = await axios.get(
					`${API}/api/users/${userId}/data`,
					tokenHeader()
				);
				if (!alive) return;
				setUser(u1.data);
			} catch {
				try {
					const u2 = await axios.get(
						`${API}/api/users/${userId}`,
						tokenHeader()
					);
					if (!alive) return;
					setUser(u2.data);
				} catch {
					try {
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
					} catch {
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
			} catch {
				if (alive) setError("Failed to load user stats.");
			}
		};

		// NEW: fetch comments grouped by field for the current month (Pacific “to date”)
		const fetchComments = async () => {
			try {
				const r = await axios.get(
					`${API}/api/comments/by-user/${userId}/by-field?scope=current`,
					tokenHeader()
				);
				if (!alive) return;
				setCommentsMap(r.data || {});
			} catch {
				// non-fatal; table will show “no comments …”
				if (alive) setCommentsMap({});
			}
		};

		fetchUser();
		fetchStats();
		fetchComments();

		return () => {
			alive = false;
		};
	}, [userId, userFromState]);

	const statRows = useMemo(() => {
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

	const commentRows = useMemo(() => {
		const map = commentsMap || {};
		return CHECK_FIELDS.map((f) => {
			const list = map[f] || []; // [{dayNumber, commentText}]
			const has = list.length > 0;

			return (
				<tr key={f}>
					<td>{labelize(f)}</td>
					<td>
						{has ? (
							<>
								<button
									className="linklike"
									onClick={() => toggle(f)}
								>
									{open[f]
										? "collapse"
										: "expand all comments"}
								</button>
								{open[f] && (
									<ul
										style={{
											margin: "8px 0 0 16px",
											padding: 0,
										}}
									>
										{list
											.slice() // shallow copy
											.sort(
												(a, b) =>
													(a.dayNumber || 0) -
													(b.dayNumber || 0)
											)
											.map((c, idx) => (
												<li
													key={idx}
													style={{ marginBottom: 4 }}
												>
													+{" "}
													{c.dayId ? (
														<Link
															to={`/days/${
																c.dayId
															}/check?userId=${userId}${
																c.monthId
																	? `&monthId=${c.monthId}`
																	: ""
															}`}
															title="Open this day's check"
														>
															<strong>
																Day{" "}
																{c.dayNumber ??
																	"?"}
																:
															</strong>{" "}
															{c.commentText}
														</Link>
													) : (
														<>
															<strong>
																Day{" "}
																{c.dayNumber ??
																	"?"}
																:
															</strong>{" "}
															{c.commentText}
														</>
													)}
												</li>
											))}
									</ul>
								)}
							</>
						) : (
							<span className="muted">
								no comments for {labelize(f)}
							</span>
						)}
					</td>
				</tr>
			);
		});
	}, [commentsMap, open, toggle]);

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

			<div className="udetails-grid">
				{/* Left: per-field success */}
				<div>
					<h3 style={{ marginTop: 8 }}>
						Check Field Success{" "}
						<small>
							({stats.currentMonth?.name} vs{" "}
							{stats.previousMonth?.name})
						</small>
					</h3>
					<table className="table grid">
						<thead>
							<tr>
								<th>Field</th>
								<th>Current Month</th>
								<th>Previous Month</th>
							</tr>
						</thead>
						<tbody>{statRows}</tbody>
					</table>
				</div>

				{/* Right: per-field comments */}
				<div>
					<h3 style={{ marginTop: 8 }}>
						Comments by Field <small>(current month)</small>
					</h3>
					<table className="table grid">
						<thead>
							<tr>
								<th>Field</th>
								<th>Comments</th>
							</tr>
						</thead>
						<tbody>{commentRows}</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
