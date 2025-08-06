import React, { useEffect, useState } from "react";
import axios from "axios";

function AdminDashboard({ user }) {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [months, setMonths] = useState([]);

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
			} catch (err) {
				console.error("Admin failed to fetch months:", err.message);
				setError("Could not load months.");
			} finally {
				setLoading(false);
			}
		};

		fetchAllMonths();
	}, []);

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
			<table>
				<thead>
					<tr>
						<th>Month Name</th>
						<th>User</th>
					</tr>
				</thead>
				<tbody>
					{months.map((month) => (
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
