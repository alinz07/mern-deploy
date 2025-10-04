// client/src/components/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

function AdminDashboard({ user }) {
	const [users, setUsers] = useState([]);
	const sortedUsers = useMemo(() => {
		return [...users].sort((a, b) => {
			const av = (a?.username || "").toLowerCase();
			const bv = (b?.username || "").toLowerCase();
			return av.localeCompare(bv);
		});
	}, [users]);

	const [months, setMonths] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingMonths, setLoadingMonths] = useState(true);
	const [error, setError] = useState("");

	// UI controls
	const [searchTerm, setSearchTerm] = useState(""); // filter by username
	const [sortDir, setSortDir] = useState("desc"); // "desc" = newest->oldest by parsed month/year
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

	const startEdit = (u) => {
		setEditId(u._id);
		setEditForm({ username: u.username || "", email: u.email || "" });
	};

	const cancelEdit = () => {
		setEditId(null);
		setEditForm({ username: "", email: "" });
	};

	const saveEdit = async () => {
		const username = (editForm.username || "").trim();
		const email = (editForm.email || "").trim();

		// Client-side checks
		if (!username) {
			alert("Username is required.");
			return;
		}
		if (username.length < 3) {
			alert("Username must be at least 3 characters.");
			return;
		}
		if (username.length > 50) {
			alert("Username must be at most 50 characters.");
			return;
		}
		if (email && !emailRegex.test(email)) {
			alert("Please enter a valid email or leave it blank.");
			return;
		}

		try {
			const res = await axios.put(
				`https://mern-deploy-i7u8.onrender.com/api/users/${editId}`,
				{ username, email }, // <-- send normalized values
				tokenHeader()
			);
			setUsers((prev) =>
				prev.map((x) => (x._id === editId ? res.data : x))
			);
			cancelEdit();
		} catch (err) {
			const msg =
				err?.response?.data?.msg ||
				err?.response?.data?.error ||
				"Failed to update user";
			alert(msg);
		}
	};

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
			} catch (e) {
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
			} catch (e) {
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
				// keep users/months usable even if stats fails
			} finally {
				setLoadingStats(false);
			}
		};

		fetchUsers();
		fetchMonths();
		fetchStats();
	}, []);

	// ---- Sorting only by parsed Month Name (e.g., "September 2025") ----
	const nameToDate = (name) => {
		if (!name) return null;
		const [mName, yStr] = name.split(" ");
		const d = new Date(`${mName} 1, ${yStr}`);
		return isNaN(d) ? null : d;
	};

	const monthRecencyTs = (m) => {
		const d = nameToDate(m?.name);
		return (d ? d : new Date(0)).getTime();
	};

	// Filter (by owner username) + sort (by parsed month/year)
	const filteredSortedMonths = useMemo(() => {
		const term = searchTerm.trim().toLowerCase();
		const byUser = (m) =>
			(m?.userId?.username || "").toLowerCase().includes(term);

		const list = term ? months.filter(byUser) : months.slice();

		list.sort((x, y) => {
			const dx = monthRecencyTs(x);
			const dy = monthRecencyTs(y);
			return sortDir === "desc" ? dy - dx : dx - dy;
		});

		return list;
	}, [months, searchTerm, sortDir]);

	// ---- Delete user (with confirmation) ----
	const handleDeleteUser = async (u) => {
		if (!u?._id) return;
		const ok = window.confirm(
			`Delete user "${u.username}" and their data? This cannot be undone.`
		);
		if (!ok) return;

		try {
			setDeletingId(u._id);
			await axios.delete(
				`https://mern-deploy-i7u8.onrender.com/api/users/${u._id}`,
				tokenHeader()
			);

			// Remove from UI
			setUsers((prev) => prev.filter((x) => x._id !== u._id));
			setMonths((prev) => prev.filter((m) => m.userId?._id !== u._id));
		} catch (err) {
			alert(
				err?.response?.data?.msg ||
					err?.response?.data?.error ||
					"Failed to delete user"
			);
		} finally {
			setDeletingId(null);
		}
	};

	if (loadingUsers || loadingMonths || loadingStats)
		return <p>Loading admin data…</p>;

	if (error) return <p style={{ color: "crimson" }}>{error}</p>;

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
						<th>% days all 10 checked (current)</th>
						<th>% days all 10 checked (previous)</th>
					</tr>
				</thead>
				<tbody>
					{stats.rows.length === 0 ? (
						<tr>
							<td
								colSpan={3}
								style={{ opacity: 0.7, fontStyle: "italic" }}
							>
								No users to show.
							</td>
						</tr>
					) : (
						stats.rows.map((r) => (
							<tr key={r.userId}>
								<td>{r.username}</td>
								<td>{r.currentMonthPercent}%</td>
								<td>{r.previousMonthPercent}%</td>
							</tr>
						))
					)}
				</tbody>
			</table>
			{/* USERS TABLE */}
			<h3>Users</h3>
			<table>
				<thead>
					<tr>
						<th>Username</th>
						<th>Email</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{sortedUsers.map((u) => {
						const isEditing = editId === u._id;
						return (
							<tr key={u._id}>
								<td>
									{isEditing ? (
										<input
											type="text"
											value={editForm.username}
											onChange={(e) =>
												setEditForm((f) => ({
													...f,
													username: e.target.value,
												}))
											}
											placeholder="username"
											style={{ padding: "4px 6px" }}
										/>
									) : (
										u.username
									)}
								</td>
								<td>
									{isEditing ? (
										<input
											type="email"
											value={editForm.email}
											onChange={(e) =>
												setEditForm((f) => ({
													...f,
													email: e.target.value,
												}))
											}
											placeholder="email"
											style={{ padding: "4px 6px" }}
										/>
									) : (
										u.email || "N/A"
									)}
								</td>
								<td>
									{isEditing ? (
										<>
											<button
												type="button"
												onClick={saveEdit}
												title="Save changes"
											>
												Save
											</button>
											<button
												type="button"
												onClick={cancelEdit}
												title="Cancel edit"
											>
												Cancel
											</button>
										</>
									) : (
										<>
											<button
												type="button"
												onClick={() => startEdit(u)}
											>
												Edit
											</button>
											<button
												type="button"
												onClick={() =>
													handleDeleteUser(u)
												}
												disabled={deletingId === u._id}
												title="Delete this user"
											>
												{deletingId === u._id
													? "Deleting…"
													: "Delete"}
											</button>
										</>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			{/* MONTHS TABLE CONTROLS */}
			<div
				style={{
					marginTop: 24,
					marginBottom: 12,
					display: "flex",
					gap: 12,
					alignItems: "center",
					flexWrap: "wrap",
				}}
			>
				<h3 style={{ margin: 0 }}>Months</h3>

				<div>
					<button
						type="button"
						onClick={() =>
							setSortDir((d) => (d === "desc" ? "asc" : "desc"))
						}
						title="Toggle month/year sort"
					>
						Sort:{" "}
						{sortDir === "desc"
							? "Newest → Oldest"
							: "Oldest → Newest"}
					</button>
				</div>
				<div>or</div>
				<div>
					<input
						type="text"
						placeholder="search by username"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						style={{ padding: "6px 8px" }}
						aria-label="search by username"
					/>
				</div>
			</div>
			{/* MONTHS TABLE */}
			<table>
				<thead>
					<tr>
						<th>Month</th>
						<th>Owner</th>
						<th>Month Start</th>
					</tr>
				</thead>
				<tbody>
					{filteredSortedMonths.map((m) => {
						const parsed = nameToDate(m.name);
						const label = parsed
							? parsed.toLocaleDateString()
							: "—";
						return (
							<tr key={m._id}>
								<td>
									<Link
										to={`/months/${m._id}`}
										title={`Open ${m.name}`}
									>
										{m.name}
									</Link>
								</td>
								<td>{m.userId?.username || "Unknown"}</td>
								<td>{label}</td>
							</tr>
						);
					})}
					{filteredSortedMonths.length === 0 && (
						<tr>
							<td
								colSpan={3}
								style={{ opacity: 0.7, fontStyle: "italic" }}
							>
								No months match your current filter.
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

export default AdminDashboard;
