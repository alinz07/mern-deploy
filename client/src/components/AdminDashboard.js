// client/src/components/AdminDashboard.js  (DROP-IN)
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

function AdminDashboard() {
	const [users, setUsers] = useState([]);
	const [months, setMonths] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingMonths, setLoadingMonths] = useState(true);
	const [error, setError] = useState("");

	// ===== UI controls (months) =====
	const [searchTerm, setSearchTerm] = useState("");
	const [sortDir, setSortDir] = useState("desc");

	// ===== UI controls (users) =====
	const [usersSearch, setUsersSearch] = useState("");
	const [usersSortDir, setUsersSortDir] = useState("asc");

	const [deletingId, setDeletingId] = useState(null);
	const [editId, setEditId] = useState(null);
	const [editForm, setEditForm] = useState({ username: "", email: "" });
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

	// ===== Create month (admin) =====
	const [showAddMonth, setShowAddMonth] = useState(false);
	const [selectedStudentId, setSelectedStudentId] = useState("");
	const [creatingMonth, setCreatingMonth] = useState(false);
	const [monthCreateMsg, setMonthCreateMsg] = useState("");

	// NEW: month selection
	const monthNames = useMemo(
		() => [
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
		],
		[]
	);

	const now = new Date();
	const [selectedMonthIndex, setSelectedMonthIndex] = useState(
		now.getMonth()
	);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());

	const yearOptions = useMemo(() => {
		const y = new Date().getFullYear();
		// currentYear-2 .. currentYear+2
		return [y - 2, y - 1, y, y + 1, y + 2];
	}, []);

	// ===== STATS =====
	const [checksStats, setChecksStats] = useState({
		rows: [],
		currentMonthLabel: "",
		previousMonthLabel: "",
	});
	const [equipStats, setEquipStats] = useState({
		rows: [],
		currentMonthLabel: "",
		previousMonthLabel: "",
	});
	const [loadingStats, setLoadingStats] = useState(true);

	// Join code
	const [joinCode, setJoinCode] = useState("");
	const [loadingJoin, setLoadingJoin] = useState(true);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

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
		if (!username) return alert("Username is required.");
		if (username.length < 3)
			return alert("Username must be at least 3 characters.");
		if (username.length > 50)
			return alert("Username must be at most 50 characters.");
		if (email && !emailRegex.test(email))
			return alert("Please enter a valid email or leave it blank.");
		try {
			const res = await axios.put(
				`https://mern-deploy-docker.onrender.com/api/users/${editId}`,
				{ username, email },
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

	useEffect(() => {
		const fetchUsers = async () => {
			try {
				const res = await axios.get(
					"https://mern-deploy-docker.onrender.com/api/users",
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
					"https://mern-deploy-docker.onrender.com/api/months",
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
				const [checksRes, equipRes] = await Promise.all([
					axios.get(
						"https://mern-deploy-docker.onrender.com/api/stats/admin-checks",
						tokenHeader()
					),
					axios.get(
						"https://mern-deploy-docker.onrender.com/api/stats/admin-equip",
						tokenHeader()
					),
				]);
				setChecksStats(checksRes.data || { rows: [] });
				setEquipStats(equipRes.data || { rows: [] });
			} catch (e) {
				console.error(e);
			} finally {
				setLoadingStats(false);
			}
		};

		const fetchJoinCode = async () => {
			try {
				const r = await axios.get(
					"https://mern-deploy-docker.onrender.com/api/admin/join-code",
					tokenHeader()
				);
				setJoinCode(r.data?.joinCode || "");
			} catch {
				setJoinCode("");
			} finally {
				setLoadingJoin(false);
			}
		};

		fetchUsers();
		fetchMonths();
		fetchStats();
		fetchJoinCode();
	}, []);

	// month label to create
	const selectedMonthName = monthNames[selectedMonthIndex] || "January";
	const monthRecordName = `${selectedMonthName} ${selectedYear}`;

	// students only
	const studentUsers = useMemo(
		() => (users || []).filter((u) => u?.role !== "admin"),
		[users]
	);

	const createMonthForSelectedStudent = async () => {
		if (!selectedStudentId) return alert("Please select a student.");

		const student = studentUsers.find((u) => u._id === selectedStudentId);
		const studentName = student?.username || "this student";

		const ok = window.confirm(
			`Create "${monthRecordName}" for ${studentName}?`
		);
		if (!ok) return;

		setCreatingMonth(true);
		setMonthCreateMsg("");

		try {
			await axios.post(
				"https://mern-deploy-docker.onrender.com/api/months/new",
				{ name: monthRecordName, userId: selectedStudentId },
				tokenHeader()
			);

			// refresh months so Owner column is populated
			const refreshed = await axios.get(
				"https://mern-deploy-docker.onrender.com/api/months",
				tokenHeader()
			);
			setMonths(refreshed.data || []);

			setMonthCreateMsg(
				`✅ "${monthRecordName}" added for ${studentName}`
			);
			setShowAddMonth(false);
			setSelectedStudentId("");
		} catch (err) {
			const msg =
				err?.response?.data?.msg ||
				err?.response?.data?.error ||
				"Failed to create month";
			setMonthCreateMsg(`❌ ${msg}`);
		} finally {
			setCreatingMonth(false);
		}
	};

	// ===== Helpers for months table =====
	const nameToDate = (name) => {
		if (!name) return null;
		const parts = name.split(" ");
		if (parts.length < 2) return null;
		const mName = parts[0];
		const yStr = parts[1];
		const d = new Date(`${mName} 1, ${yStr}`);
		return isNaN(d) ? null : d;
	};
	const monthRecencyTs = (m) => {
		const d = nameToDate(m?.name);
		return (d ? d : new Date(0)).getTime();
	};

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

	// ===== Users search + sort =====
	const filteredSortedUsers = useMemo(() => {
		const term = usersSearch.trim().toLowerCase();
		const list = term
			? users.filter((u) =>
					(u?.username || "").toLowerCase().includes(term)
			  )
			: users.slice();

		list.sort((a, b) => {
			const av = (a?.username || "").toLowerCase();
			const bv = (b?.username || "").toLowerCase();
			const cmp = av.localeCompare(bv);
			return usersSortDir === "asc" ? cmp : -cmp;
		});

		return list;
	}, [users, usersSearch, usersSortDir]);

	// Merge equipment stats into checks rows by userId
	const mergedRows = useMemo(() => {
		const byId = new Map(
			(checksStats.rows || []).map((r) => [r.userId, { ...r }])
		);
		for (const er of equipStats.rows || []) {
			const base = byId.get(er.userId) || {
				userId: er.userId,
				username: er.username,
			};
			byId.set(er.userId, {
				...base,
				currEquipPercent: er.currEquipPercent || 0,
				currEquipDen: er.currEquipDen || 0,
				prevEquipPercent: er.prevEquipPercent || 0,
				prevEquipDen: er.prevEquipDen || 0,
			});
		}
		return Array.from(byId.values()).sort((a, b) =>
			(a.username || "").localeCompare(b.username || "")
		);
	}, [checksStats.rows, equipStats.rows]);

	const monthsTableRows = useMemo(() => {
		const list = filteredSortedMonths;
		if (list.length === 0) {
			return (
				<tr>
					<td
						colSpan={3}
						style={{ opacity: 0.7, fontStyle: "italic" }}
					>
						No months match your current filter.
					</td>
				</tr>
			);
		}
		return list.map((m) => {
			const parsed = nameToDate(m.name);
			const label = parsed ? parsed.toLocaleDateString() : "—";
			return (
				<tr key={m._id}>
					<td>
						<Link to={`/months/${m._id}`} title={`Open ${m.name}`}>
							{m.name}
						</Link>
					</td>
					<td>{m.userId?.username || "Unknown"}</td>
					<td>{label}</td>
				</tr>
			);
		});
	}, [filteredSortedMonths]);

	if (loadingUsers || loadingMonths || loadingStats)
		return <p>Loading admin data…</p>;
	if (error) return <p style={{ color: "crimson" }}>{error}</p>;

	const StatCell = ({ pct, den }) => (
		<td>
			{pct}% out of {den} day{den === 1 ? "" : "s"}
		</td>
	);

	const copy = async () => {
		if (!joinCode) return;
		try {
			await navigator.clipboard.writeText(joinCode);
			alert("Join code copied!");
		} catch {
			window.prompt("Copy this join code:", joinCode);
		}
	};

	return (
		<div className="admin-dashboard">
			<div className="page-header">
				<h2>Admin Dashboard</h2>

				<div
					style={{
						flex: 1,
						display: "flex",
						justifyContent: "center",
					}}
				>
					<div className="join-chip">
						<span className="muted">Join code:</span>
						<strong style={{ letterSpacing: 0.5 }}>
							{loadingJoin ? "…" : joinCode || "—"}
						</strong>
						<button
							type="button"
							onClick={copy}
							disabled={!joinCode}
							title="Copy join code"
						>
							Copy
						</button>
					</div>
				</div>

				<a href="/equipment">
					<button type="button" title="Manage Equipment Inventory">
						Equipment
					</button>
				</a>
			</div>

			<h3>Completion Stats</h3>
			<p style={{ marginTop: -8, opacity: 0.8 }}>
				Current month: {checksStats.currentMonthLabel || "—"} (to date)
				· Previous month: {checksStats.previousMonthLabel || "—"}
			</p>

			<table>
				<thead>
					<tr>
						<th>User</th>
						<th>
							{checksStats.currentMonthLabel || "Current"} —
							Online
						</th>
						<th>
							{checksStats.currentMonthLabel || "Current"} —
							In-Person
						</th>
						<th>
							{checksStats.previousMonthLabel || "Previous"} —
							Online
						</th>
						<th>
							{checksStats.previousMonthLabel || "Previous"} —
							In-Person
						</th>
						<th>
							{checksStats.currentMonthLabel || "Current"} —
							Equipment
						</th>
						<th>
							{checksStats.previousMonthLabel || "Previous"} —
							Equipment
						</th>
					</tr>
				</thead>
				<tbody>
					{mergedRows.length === 0 ? (
						<tr>
							<td
								colSpan={7}
								style={{ opacity: 0.7, fontStyle: "italic" }}
							>
								No users to show.
							</td>
						</tr>
					) : (
						mergedRows.map((r) => (
							<tr key={r.userId}>
								<td>{r.username}</td>
								<StatCell
									pct={r.currOnlinePercent ?? 0}
									den={r.currOnlineDen ?? 0}
								/>
								<StatCell
									pct={r.currInpersonPercent ?? 0}
									den={r.currInpersonDen ?? 0}
								/>
								<StatCell
									pct={r.prevOnlinePercent ?? 0}
									den={r.prevOnlineDen ?? 0}
								/>
								<StatCell
									pct={r.prevInpersonPercent ?? 0}
									den={r.prevInpersonDen ?? 0}
								/>
								<StatCell
									pct={r.currEquipPercent ?? 0}
									den={r.currEquipDen ?? 0}
								/>
								<StatCell
									pct={r.prevEquipPercent ?? 0}
									den={r.prevEquipDen ?? 0}
								/>
							</tr>
						))
					)}
				</tbody>
			</table>

			{/* ======= USERS ======= */}
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
				<h3 style={{ margin: 0 }}>Users</h3>
				<div>
					<button
						type="button"
						onClick={() =>
							setUsersSortDir((d) =>
								d === "asc" ? "desc" : "asc"
							)
						}
						title="Toggle username sort"
					>
						Sort: {usersSortDir === "asc" ? "A → Z" : "Z → A"}
					</button>
				</div>
				<div>or</div>
				<div>
					<input
						type="text"
						placeholder="search by username"
						value={usersSearch}
						onChange={(e) => setUsersSearch(e.target.value)}
						style={{ padding: "6px 8px" }}
						aria-label="search users by username"
					/>
				</div>
			</div>

			<table>
				<thead>
					<tr>
						<th>Username</th>
						<th>Email</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{filteredSortedUsers.map((u) => {
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
									) : u.role !== "admin" ? (
										<Link
											to={`/admin/users/${u._id}`}
											state={{ user: u }}
										>
											{u.username}
										</Link>
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
												onClick={() => {
													if (
														window.confirm(
															`Delete user "${u.username}" and their data? This cannot be undone.`
														)
													) {
														setDeletingId(u._id);
														axios
															.delete(
																`https://mern-deploy-docker.onrender.com/api/users/${u._id}`,
																tokenHeader()
															)
															.then(() => {
																setUsers(
																	(prev) =>
																		prev.filter(
																			(
																				x
																			) =>
																				x._id !==
																				u._id
																		)
																);
																setMonths(
																	(prev) =>
																		prev.filter(
																			(
																				m
																			) =>
																				m
																					.userId
																					?._id !==
																				u._id
																		)
																);
															})
															.finally(() =>
																setDeletingId(
																	null
																)
															);
													}
												}}
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

			{/* ======= MONTHS ======= */}
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

				{/* Add Month UI */}
				<div
					style={{
						marginLeft: "auto",
						display: "flex",
						gap: 8,
						flexWrap: "wrap",
					}}
				>
					<button
						type="button"
						onClick={() => {
							setMonthCreateMsg("");
							setShowAddMonth((v) => !v);
						}}
						title="Create a month for a student"
					>
						Add Month
					</button>

					{showAddMonth && (
						<>
							<select
								value={selectedStudentId}
								onChange={(e) =>
									setSelectedStudentId(e.target.value)
								}
								style={{ padding: "6px 8px" }}
								aria-label="select student for month creation"
							>
								<option value="">Select student…</option>
								{studentUsers.map((u) => (
									<option key={u._id} value={u._id}>
										{u.username}
									</option>
								))}
							</select>

							<select
								value={selectedMonthIndex}
								onChange={(e) =>
									setSelectedMonthIndex(
										Number(e.target.value)
									)
								}
								style={{ padding: "6px 8px" }}
								aria-label="select month"
							>
								{monthNames.map((mn, idx) => (
									<option key={mn} value={idx}>
										{mn}
									</option>
								))}
							</select>

							<select
								value={selectedYear}
								onChange={(e) =>
									setSelectedYear(Number(e.target.value))
								}
								style={{ padding: "6px 8px" }}
								aria-label="select year"
							>
								{yearOptions.map((y) => (
									<option key={y} value={y}>
										{y}
									</option>
								))}
							</select>

							<button
								type="button"
								onClick={createMonthForSelectedStudent}
								disabled={creatingMonth}
								title={`Create ${monthRecordName} for selected student`}
							>
								{creatingMonth
									? "Creating…"
									: `Create ${monthRecordName}`}
							</button>

							<button
								type="button"
								onClick={() => {
									setShowAddMonth(false);
									setSelectedStudentId("");
								}}
								disabled={creatingMonth}
								title="Cancel"
							>
								Cancel
							</button>
						</>
					)}
				</div>

				{monthCreateMsg && (
					<div style={{ width: "100%", opacity: 0.9 }}>
						{monthCreateMsg}
					</div>
				)}
			</div>

			<table>
				<thead>
					<tr>
						<th>Month</th>
						<th>Owner</th>
						<th>Month Start</th>
					</tr>
				</thead>
				<tbody>{monthsTableRows}</tbody>
			</table>
		</div>
	);
}

export default AdminDashboard;
