// client/src/components/AdminDashboard.js  (DROP-IN)
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

function AdminDashboard({ user }) {
	const [users, setUsers] = useState([]);
	const sortedUsers = useMemo(() => {
		return [...users].sort((a, b) =>
			(a?.username || "").localeCompare(b?.username || "")
		);
	}, [users]);

	const [months, setMonths] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingMonths, setLoadingMonths] = useState(true);
	const [error, setError] = useState("");

	const [searchTerm, setSearchTerm] = useState("");
	const [sortDir, setSortDir] = useState("desc");
	const [deletingId, setDeletingId] = useState(null);
	const [editId, setEditId] = useState(null);
	const [editForm, setEditForm] = useState({ username: "", email: "" });
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

	const [stats, setStats] = useState({
		rows: [],
		currentMonthLabel: "",
		previousMonthLabel: "",
	});
	const [loadingStats, setLoadingStats] = useState(true);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	useEffect(() => {
		const fetchUsers = async () => {
			try {
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/users",
					tokenHeader()
				);
				setUsers(res.data);
			} catch {
				setError("Failed to load users");
			} finally {
				setLoadingUsers(false);
			}
		};
		const fetchMonths = async () => {
			try {
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/months",
					tokenHeader()
				);
				setMonths(res.data);
			} catch {
				setError("Failed to load months");
			} finally {
				setLoadingMonths(false);
			}
		};
		const fetchStats = async () => {
			try {
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/stats/admin-checks",
					tokenHeader()
				);
				setStats(res.data);
			} catch (e) {
				console.error(e);
			} finally {
				setLoadingStats(false);
			}
		};

		fetchUsers();
		fetchMonths();
		fetchStats();
	}, []);

	const nameToDate = (name) => {
		if (!name) return null;
		const [mName, yStr] = name.split(" ");
		const d = new Date(`${mName} 1, ${yStr}`);
		return isNaN(d) ? null : d;
	};
	const monthRecencyTs = (m) => nameToDate(m?.name)?.getTime?.() ?? 0;

	const filteredSortedMonths = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		const list = term
			? months.filter((m) =>
					(m?.userId?.username || "").toLowerCase().includes(term)
			  )
			: months.slice();
		list.sort((x, y) => {
			const dx = monthRecencyTs(x);
			const dy = monthRecencyTs(y);
			return sortDir === "desc" ? dy - dx : dx - dy;
		});
		return list;
	}, [months, searchTerm, sortDir]);

	if (loadingUsers || loadingMonths || loadingStats)
		return <p>Loading admin data…</p>;
	if (error) return <p style={{ color: "crimson" }}>{error}</p>;

	// helper to render a tooltip cell
	const StatCell = ({ pct, suc, den, label }) => {
		const title = `${suc} of ${den} day${den === 1 ? "" : "s"} successful`;
		return (
			<td title={title} aria-label={`${label}: ${title}`}>
				{pct}%
			</td>
		);
	};

	return (
		<div>
			<h2>Admin Dashboard</h2>

			<h3>Completion Stats</h3>
			<p style={{ marginTop: -8, opacity: 0.8 }}>
				Current month: {stats.currentMonthLabel || "—"} (to date) ·
				Previous month: {stats.previousMonthLabel || "—"}
			</p>

			<table>
				<thead>
					<tr>
						<th>User</th>
						<th>Current Month — Online</th>
						<th>Current Month — In-Person</th>
						<th>Previous Month — Online</th>
						<th>Previous Month — In-Person</th>
					</tr>
				</thead>
				<tbody>
					{stats.rows.length === 0 ? (
						<tr>
							<td
								colSpan={5}
								style={{ opacity: 0.7, fontStyle: "italic" }}
							>
								No users to show.
							</td>
						</tr>
					) : (
						stats.rows.map((r) => (
							<tr key={r.userId}>
								<td>{r.username}</td>

								<StatCell
									pct={r.currOnlinePercent}
									suc={r.currOnlineSuc}
									den={r.currOnlineDen}
									label="Current Online"
								/>
								<StatCell
									pct={r.currInpersonPercent}
									suc={r.currInpersonSuc}
									den={r.currInpersonDen}
									label="Current In-Person"
								/>
								<StatCell
									pct={r.prevOnlinePercent}
									suc={r.prevOnlineSuc}
									den={r.prevOnlineDen}
									label="Previous Online"
								/>
								<StatCell
									pct={r.prevInpersonPercent}
									suc={r.prevInpersonSuc}
									den={r.prevInpersonDen}
									label="Previous In-Person"
								/>
							</tr>
						))
					)}
				</tbody>
			</table>

			{/* …rest of your existing AdminDashboard (users table, etc.) stays unchanged … */}
		</div>
	);
}

export default AdminDashboard;
