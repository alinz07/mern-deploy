// client/pages/UserDetails.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com"; // matches your pattern
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

const CHECK_LABELS = {
	checkone: "u (oo)",
	checktwo: "a (ah)",
	checkthree: "i (ee)",
	checkfour: "s (s)",
	checkfive: "ʃ (sh)",
	checksix: "m (m)",
	checkseven: "n (n)",
	checkeight: "dʒ (j)",
	checknine: "z (z)",
	checkten: "h (h)",
};

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const YEAR_OPTIONS = (() => {
	const y = new Date().getFullYear();
	return [y - 1, y, y + 1].map(String);
})();

// ===== Months helpers =====
const nameToDate = (name) => {
	if (!name) return null;
	const parts = String(name).split(" ");
	if (parts.length < 2) return null;
	const mName = parts[0];
	const yStr = parts[1];
	const d = new Date(`${mName} 1, ${yStr}`);
	return Number.isNaN(d.getTime()) ? null : d;
};

const monthRecencyTs = (m) => {
	const d = nameToDate(m?.name);
	return (d ? d : new Date(0)).getTime();
};

function labelize(key) {
	return CHECK_LABELS[key] || key;
}

// Format from real ISO (if present)
const fmtPTDateISO = (iso) => {
	if (iso == null) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString("en-US", {
		timeZone: "America/Los_Angeles",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
};

// Robust: "October 2025" + dayNumber -> Pacific date
const fmtFromMonthName = (monthName, dayNumber) => {
	if (monthName == null || dayNumber == null) return null;
	const m = String(monthName)
		.trim()
		.match(/^([A-Za-z]+)\s+(\d{4})$/);
	if (!m) return null;
	const MONTHS = {
		January: 0,
		February: 1,
		March: 2,
		April: 3,
		May: 4,
		June: 5,
		July: 6,
		August: 7,
		September: 8,
		October: 9,
		November: 10,
		December: 11,
	};
	const mi = MONTHS[m[1]];
	if (mi == null) return null;
	const y = Number(m[2]);
	const dnum = Number(dayNumber);
	if (!Number.isFinite(dnum) || dnum <= 0) return null;
	const dt = new Date(Date.UTC(y, mi, dnum));
	if (Number.isNaN(dt.getTime())) return null;
	return dt.toLocaleDateString("en-US", {
		timeZone: "America/Los_Angeles",
		month: "long",
		day: "numeric",
		year: "numeric",
	});
};

export default function UserDetails() {
	const { userId } = useParams();
	const location = useLocation();
	const userFromState = location.state?.user || null;

	const [user, setUser] = useState(userFromState);
	const [stats, setStats] = useState(null);

	// separate maps for current/previous comments
	const [commentsCurrent, setCommentsCurrent] = useState(null);
	const [commentsPrev, setCommentsPrev] = useState(null);

	// expand/collapse per column
	const [openCur, setOpenCur] = useState({});
	const [openPrev, setOpenPrev] = useState({});
	const [error, setError] = useState("");

	// ===== Months table (same data source as AdminDashboard) =====
	const [months, setMonths] = useState([]);
	const [loadingMonths, setLoadingMonths] = useState(true);
	const [monthsError, setMonthsError] = useState("");
	const [monthsSortDir, setMonthsSortDir] = useState("desc"); // newest->oldest

	// Add month UI
	const [showAddMonth, setShowAddMonth] = useState(false);
	const [newMonthName, setNewMonthName] = useState(
		MONTH_NAMES[new Date().getMonth()]
	);
	const [newMonthYear, setNewMonthYear] = useState(
		String(new Date().getFullYear())
	);
	const [creatingMonth, setCreatingMonth] = useState(false);
	const [createMonthError, setCreateMonthError] = useState("");

	const toggleCur = useCallback((field) => {
		setOpenCur((p) => ({ ...p, [field]: !p[field] }));
	}, []);

	const togglePrev = useCallback((field) => {
		setOpenPrev((p) => ({ ...p, [field]: !p[field] }));
	}, []);

	// ✅ Single source of truth for months fetching (used by useEffect + after create)
	const fetchMonthsForUser = useCallback(async () => {
		setLoadingMonths(true);
		setMonthsError("");
		try {
			const r = await axios.get(`${API}/api/months`, tokenHeader());
			const all = r.data || [];

			const filtered = all.filter((m) => {
				const ownerId =
					typeof m.userId === "object" ? m.userId?._id : m.userId;
				return String(ownerId) === String(userId);
			});

			setMonths(filtered);
		} catch {
			setMonths([]);
			setMonthsError("Failed to load months.");
		} finally {
			setLoadingMonths(false);
		}
	}, [userId]);

	const onCreateMonth = async () => {
		const name = `${newMonthName} ${newMonthYear}`;

		const ok = window.confirm(
			`Create month "${name}" for ${user?.username || "this user"}?`
		);
		if (!ok) return;

		setCreatingMonth(true);
		setCreateMonthError("");

		try {
			await axios.post(
				`${API}/api/months/new`,
				{ name, userId },
				tokenHeader()
			);

			await fetchMonthsForUser(); // refresh table
			setShowAddMonth(false);
		} catch (e) {
			setCreateMonthError(
				e?.response?.data?.msg || "Failed to create month."
			);
		} finally {
			setCreatingMonth(false);
		}
	};

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
				if (alive) {
					setError("Session expired. Please sign in again.");
					localStorage.removeItem("token");
				}
			}
		};

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

		(async () => {
			await Promise.all([
				fetchUser(),
				fetchStats(),
				fetchCommentsCurrent(),
				fetchCommentsPrev(),
				fetchMonthsForUser(),
			]);
		})();

		return () => {
			alive = false;
		};
	}, [userId, userFromState, fetchMonthsForUser]);

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

	const renderCommentList = useCallback(
		(list) => (
			<ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
				{list
					.slice()
					.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))
					.map((c, idx) => {
						const niceDate =
							fmtFromMonthName(c.monthName, c.dayNumber) ||
							fmtPTDateISO(c.dateISO) ||
							(typeof c.dayNumber === "number"
								? `Day ${c.dayNumber}`
								: "Day ?");
						return (
							<li key={idx} style={{ marginBottom: 4 }}>
								{c.dayId ? (
									<Link
										to={`/days/${c.dayId}/check?userId=${userId}${
											c.monthId
												? `&monthId=${c.monthId}`
												: ""
										}`}
										title="Open this day's check"
										target="_blank"
										rel="noopener noreferrer"
									>
										<strong>{niceDate}:</strong>{" "}
										{c.commentText}
									</Link>
								) : (
									<>
										<strong>{niceDate}:</strong>{" "}
										{c.commentText}
									</>
								)}
							</li>
						);
					})}
			</ul>
		),
		[userId]
	);

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
								{openCur[f] && renderCommentList(curList)}
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
								{openPrev[f] && renderCommentList(prevList)}
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
		renderCommentList,
	]);

	const sortedMonths = useMemo(() => {
		const list = (months || []).slice();
		list.sort((a, b) => {
			const da = monthRecencyTs(a);
			const db = monthRecencyTs(b);
			return monthsSortDir === "desc" ? db - da : da - db;
		});
		return list;
	}, [months, monthsSortDir]);

	const monthsTableRows = useMemo(() => {
		if (loadingMonths) {
			return (
				<tr>
					<td
						colSpan={2}
						style={{ opacity: 0.7, fontStyle: "italic" }}
					>
						Loading months…
					</td>
				</tr>
			);
		}
		if (monthsError) {
			return (
				<tr>
					<td colSpan={2} style={{ color: "crimson" }}>
						{monthsError}
					</td>
				</tr>
			);
		}
		if (!sortedMonths.length) {
			return (
				<tr>
					<td
						colSpan={2}
						style={{ opacity: 0.7, fontStyle: "italic" }}
					>
						No months found for this user.
					</td>
				</tr>
			);
		}

		return sortedMonths.map((m) => {
			const parsed = nameToDate(m.name);
			const startLabel = parsed ? parsed.toLocaleDateString() : "—";
			return (
				<tr key={m._id}>
					<td>
						<Link to={`/months/${m._id}`} title={`Open ${m.name}`}>
							{m.name}
						</Link>
					</td>
					<td>{startLabel}</td>
				</tr>
			);
		});
	}, [sortedMonths, loadingMonths, monthsError]);

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

			{/* ===== Months table (with Add Month button) ===== */}
			<div style={{ marginTop: 18, marginBottom: 18 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						flexWrap: "wrap",
					}}
				>
					<h3 style={{ margin: 0 }}>Months</h3>

					<button
						onClick={() => {
							setCreateMonthError("");
							setShowAddMonth((p) => !p);
						}}
					>
						{showAddMonth ? "Cancel" : "Add Month"}
					</button>

					{showAddMonth && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								flexWrap: "wrap",
							}}
						>
							<select
								value={newMonthName}
								onChange={(e) =>
									setNewMonthName(e.target.value)
								}
							>
								{MONTH_NAMES.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>

							<select
								value={newMonthYear}
								onChange={(e) =>
									setNewMonthYear(e.target.value)
								}
							>
								{YEAR_OPTIONS.map((y) => (
									<option key={y} value={y}>
										{y}
									</option>
								))}
							</select>

							<button
								onClick={onCreateMonth}
								disabled={creatingMonth}
							>
								{creatingMonth ? "Creating..." : "Create"}
							</button>

							{createMonthError && (
								<span style={{ color: "crimson" }}>
									{createMonthError}
								</span>
							)}
						</div>
					)}

					<button
						type="button"
						onClick={() =>
							setMonthsSortDir((d) =>
								d === "desc" ? "asc" : "desc"
							)
						}
						title="Toggle month/year sort"
					>
						Sort:{" "}
						{monthsSortDir === "desc"
							? "Newest → Oldest"
							: "Oldest → Newest"}
					</button>
				</div>

				<table className="table grid" style={{ marginTop: 10 }}>
					<thead>
						<tr>
							<th>Month</th>
							<th>Month Start</th>
						</tr>
					</thead>
					<tbody>{monthsTableRows}</tbody>
				</table>
			</div>

			<div className="udetails-grid">
				{/* Left: per-field success */}
				<div>
					<h3 style={{ marginTop: 8 }}>
						Sound Check Success{" "}
						<small>
							({stats.currentMonth?.name} vs{" "}
							{stats.previousMonth?.name})
						</small>
					</h3>
					<table className="table grid">
						<thead>
							<tr>
								<th>Field</th>
								<th>({stats.currentMonth?.name})</th>
								<th>({stats.previousMonth?.name})</th>
							</tr>
						</thead>
						<tbody>{statRows}</tbody>
					</table>
				</div>

				{/* Right: per-field comments (current & previous) */}
				<div>
					<h3 style={{ marginTop: 8 }}>
						Comments by Sound{" "}
						<small>
							({stats.currentMonth?.name} vs{" "}
							{stats.previousMonth?.name})
						</small>
					</h3>
					<table className="table grid">
						<thead>
							<tr>
								<th>Field</th>
								<th>({stats.currentMonth?.name})</th>
								<th>({stats.previousMonth?.name})</th>
							</tr>
						</thead>
						<tbody>{commentsRows}</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
