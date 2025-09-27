// client/src/components/AdminDashboard.js
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

function AdminDashboard({ user }) {
	const [users, setUsers] = useState([]);
	const [months, setMonths] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingMonths, setLoadingMonths] = useState(true);
	const [error, setError] = useState("");

	// UI controls
	const [searchTerm, setSearchTerm] = useState(""); // filter by username
	const [sortDir, setSortDir] = useState("desc"); // "desc" = newest->oldest by parsed month/year
	const [deletingId, setDeletingId] = useState(null);

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

		fetchUsers();
		fetchMonths();
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

	if (loadingUsers || loadingMonths) return <p>Loading admin data…</p>;
	if (error) return <p style={{ color: "crimson" }}>{error}</p>;

	return (
		<div>
			<h2>Admin Dashboard</h2>

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
					{users.map((u) => (
						<tr key={u._id}>
							<td>{u.username}</td>
							<td>{u.email || "N/A"}</td>
							<td>
								<button disabled>Edit</button>
								<button
									type="button"
									onClick={() => handleDeleteUser(u)}
									disabled={deletingId === u._id}
									title="Delete this user"
								>
									{deletingId === u._id
										? "Deleting…"
										: "Delete"}
								</button>
							</td>
						</tr>
					))}
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
					<input
						type="text"
						placeholder="Filter months by username…"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						style={{ padding: "6px 8px" }}
						aria-label="Filter months by username"
					/>
				</div>
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
