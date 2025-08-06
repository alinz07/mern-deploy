import React, { useEffect, useState } from "react";
import axios from "axios";

function AdminDashboard({ user }) {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [months, setMonths] = useState([]);
	const [filteredMonths, setFilteredMonths] = useState([]);
	const [selectedUser, setSelectedUser] = useState("all");
	const [sortAsc, setSortAsc] = useState(true);

	useEffect(() => {
		const fetchUsers = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/users", // ✅ Future endpoint
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
				setLoading(false);
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
				setLoading(false);
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

	if (loading) return <p>Loading users...</p>;
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
							{/* <th>Email</th> */}
							<th>Actions</th>{" "}
							{/* Placeholder for future actions */}
						</tr>
					</thead>
					<tbody>
						{users.map((u) => (
							<tr key={u._id}>
								<td>{u.username}</td>
								{/* <td>{u.email || "N/A"}</td> */}
								<td>
									{/* Future: Add edit/delete buttons here */}
									<button disabled>Edit</button>
									<button disabled>Delete</button>
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
