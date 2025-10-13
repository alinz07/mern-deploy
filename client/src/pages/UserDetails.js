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

	// NEW: two separate maps for comments
	const [commentsCurrent, setCommentsCurrent] = useState(null); // scope=current
	const [commentsPrev, setCommentsPrev] = useState(null); // scope=previous

	// separate expand/collapse state for each column
	const [openCur, setOpenCur] = useState({});
	const [openPrev, setOpenPrev] = useState({});

	const [error, setError] = useState("");

	const toggleCur = useCallback((field) => {
		setOpenCur((p) => ({ ...p, [field]: !p[field] }));
	}, []);
	const togglePrev = useCallback((field) => {
		setOpenPrev((p) => ({ ...p, [field]: !p[field] }));
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

		// Pull current-month comments (PT, to-date)
		const fetchCommentsCurrent = async () => {
			try {
				const r = await axios.get(
					`${API}/api/comments/by-user/${userId}/by-field?scope=current`,
					tokenHeader()
				);
				if (!alive) return;
				setCommentsCurrent(r.data || {});
			} catch {
				if (alive) setCommentsCurrent({});
			}
		};

		// Pull previous-month comments
		const fetchCommentsPrev = async () => {
			try {
				const r = await axios.get(
					`${API}/api/comments/by-user/${userId}/by-field?scope=previous`,
					tokenHeader()
				);
				if (!alive) return;
				setCommentsPrev(r.data || {});
			} catch {
				if (alive) setCommentsPrev({});
			}
		};

		fetchUser();
		fetchStats();
		fetchCommentsCurrent();
		fetchCommentsPrev();

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

	const renderCommentList = (list, isPrev) => {
		return (
			<ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
				{list
					.slice()
					.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))
					.map((c, idx) => (
						<li key={idx} style={{ marginBottom: 4 }}>
							{c.dayId ? (
								<Link
									to={`/days/${
										c.dayId
									}/check?userId=${userId}${
										c.monthId ? `&monthId=${c.monthId}` : ""
									}`}
									title="Open this day's check"
									target="_blank" // ← open in new tab
									rel="noopener noreferrer" // ← security
								>
									<strong>Day {c.dayNumber ?? "?"}:</strong>{" "}
									{c.commentText}
								</Link>
							) : (
								<>
									<strong>Day {c.dayNumber ?? "?"}:</strong>{" "}
									{c.commentText}
								</>
							)}
						</li>
					))}
			</ul>
		);
	};

	const commentsRows = useMemo(() => {
		const curMap = commentsCurrent || {};
		const prevMap = commentsPrev || {};
		return CHECK_FIELDS.map((f) => {
			const curList = curMap[f] || [];
			const prevList = prevMap[f] || [];
			const hasCur = curList.length > 0;
			const hasPrev = prevList.length > 0;

			return (
				<tr key={f}>
					<td>{labelize(f)}</td>

					{/* Current month column */}
					<td>
						{hasCur ? (
							<>
								<button
									className="linklike"
									onClick={() => toggleCur(f)}
								>
									{openCur[f]
										? "collapse"
										: "expand all comments"}
								</button>
								{openCur[f] &&
									renderCommentList(curList, false)}
							</>
						) : (
							<span className="muted">
								no comments for {labelize(f)}
							</span>
						)}
					</td>

					{/* Previous month column */}
					<td>
						{hasPrev ? (
							<>
								<button
									className="linklike"
									onClick={() => togglePrev(f)}
								>
									{openPrev[f]
										? "collapse"
										: "expand all comments"}
								</button>
								{openPrev[f] &&
									renderCommentList(prevList, true)}
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
	}, [
		commentsCurrent,
		commentsPrev,
		openCur,
		openPrev,
		toggleCur,
		togglePrev,
		userId,
	]);

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

				{/* Right: per-field comments (now 2 columns: current & previous) */}
				<div>
					<h3 style={{ marginTop: 8 }}>
						Comments by Field{" "}
						<small>(current & previous month)</small>
					</h3>
					<table className="table grid">
						<thead>
							<tr>
								<th>Field</th>
								<th>Current Month</th>
								<th>Previous Month</th>
							</tr>
						</thead>
						<tbody>{commentsRows}</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
