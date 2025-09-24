import React, { useEffect, useState } from "react";
import axios from "axios";

function AdminDashboard({ user }) {
	const [users, setUsers] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingMonths, setLoadingMonths] = useState(true);
	const [error, setError] = useState("");
	const [months, setMonths] = useState([]);
	const [filteredMonths, setFilteredMonths] = useState([]);
	const [selectedUser, setSelectedUser] = useState("all");
	const [sortAsc, setSortAsc] = useState(true);
	const [deletingId, setDeletingId] = useState(null);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	useEffect(() => {
		const fetchUsers = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/users",
					{
						headers: { "x-auth-token": token },
					}
				);
				setUsers(res.data);
			} catch (err) {
				console.error(
					"Failed to fetch users:",
					err.response?.data || err.message
				);
				setError("Failed to load users");
			} finally {
				setLoadingUsers(false); // 🔹
			}
		};

		fetchUsers();
	}, []);

	useEffect(() => {
		const fetchAllMonths = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/months",
					{
						headers: { "x-auth-token": token },
					}
				);
				setMonths(res.data);
				setFilteredMonths(res.data);
			} catch (err) {
				console.error("Admin failed to fetch months:", err.message);
				setError("Could not load months.");
			} finally {
				setLoadingMonths(false); // 🔹
			}
		};

		fetchAllMonths();
	}, []);

	const uniqueUsers = [...new Set(months.map((m) => m.userId?.username))];

	// Handle filter
	const handleFilter = (e) => {
		const username = e.target.value;
		setSelectedUser(username);

		if (username === "all") {
			setFilteredMonths([...months]);
		} else {
			const filtered = months.filter(
				(m) => m.userId?.username === username
			);
			setFilteredMonths(filtered);
		}
	};

	// Handle sort toggle
	const handleSort = () => {
		const sorted = [...filteredMonths].sort((a, b) => {
			const nameA = a.userId?.username?.toLowerCase() || "";
			const nameB = b.userId?.username?.toLowerCase() || "";
			return sortAsc
				? nameA.localeCompare(nameB)
				: nameB.localeCompare(nameA);
		});
		setFilteredMonths(sorted);
		setSortAsc(!sortAsc);
	};

	// Export to CSV
	const exportCSV = () => {
		const headers = ["Month Name", "Username"];
		const rows = filteredMonths.map((m) => [
			m.name,
			m.userId?.username || "",
		]);

		let csvContent =
			"data:text/csv;charset=utf-8," +
			[headers, ...rows].map((e) => e.join(",")).join("\n");

		const encodedUri = encodeURI(csvContent);
		const link = document.createElement("a");
		link.setAttribute("href", encodedUri);
		link.setAttribute("download", "months_export.csv");
		document.body.appendChild(link); // Required for Firefox
		link.click();
		document.body.removeChild(link);
	};

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
			// Remove user from local state
			setUsers((prev) => prev.filter((x) => x._id !== u._id));
			// Remove their months from both tables
			setMonths((prev) => prev.filter((m) => m.userId?._id !== u._id));
			setFilteredMonths((prev) =>
				prev.filter((m) => m.userId?._id !== u._id)
			);
			// If you want to reset the filter when the selected user was deleted:
			if (selectedUser === u.username) setSelectedUser("all");
		} catch (err) {
			console.error("Delete failed:", err.response?.data || err.message);
			alert(
				err?.response?.data?.msg ||
					err?.response?.data?.error ||
					"Failed to delete user"
			);
		} finally {
			setDeletingId(null);
		}
	};

	if (loadingUsers || loadingMonths) return <p>Loading dashboard data...</p>;
	if (error) return <p className="error">{error}</p>;

	return (
		<div className="admin-dashboard">
			<h3>All Registered Users</h3>

			{users.length === 0 ? (
				<p>No users found.</p>
			) : (
				<table>
					<thead>
						<tr>
							<th>Username</th>
							<th>Email</th>
							<th>Actions</th>{" "}
							{/* Placeholder for future actions */}
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
										onClick={() => handleDeleteUser(u)}
										disabled={deletingId === u._id}
										title="Delete this user"
									>
										{deletingId === u._id
											? "Deleting…"
											: "Delete"}
									</button>{" "}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			<h3>All Users' Months</h3>
			{/* Filter Dropdown */}
			<label>Filter by User: </label>
			<select value={selectedUser} onChange={handleFilter}>
				<option value="all">All</option>
				{uniqueUsers.map((user) => (
					<option key={user} value={user}>
						{user}
					</option>
				))}
			</select>

			{/* Sort Button */}
			<button onClick={handleSort}>
				Sort by Username {sortAsc ? "↑" : "↓"}
			</button>
			{/* Export Button */}
			<button onClick={exportCSV}>Export as CSV</button>

			{/* Table */}
			<table>
				<thead>
					<tr>
						<th>Month Name</th>
						<th>Username</th>
					</tr>
				</thead>
				<tbody>
					{filteredMonths.map((month) => (
						<tr key={month._id}>
							<td>{month.name}</td>
							<td>{month.userId?.username || "Unknown"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default AdminDashboard;
