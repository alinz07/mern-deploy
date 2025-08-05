import React, { useEffect, useState } from "react";
import axios from "axios";

function UserDashboard({ userId, user }) {
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const res = await axios.get(
					`https://mern-deploy-i7u8.onrender.com/api/students/${userId}/data`
				);
				setData(res.data);
			} catch (err) {
				console.error("Failed to load user data:", err.message);
			} finally {
				setLoading(false);
			}
		};

		if (userId) fetchData();
	}, [userId]);

	if (loading) return <p>Loading your data...</p>;

	return (
		<div>
			<h2>Welcome, {user.username}</h2>
			<h3>Your Data</h3>
			<ul>
				{data.map((item) => (
					<li key={item._id}>{item.title}</li>
				))}
			</ul>
		</div>
	);
}

export default UserDashboard;
