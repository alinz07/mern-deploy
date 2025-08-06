import React, { useEffect, useState } from "react";
import axios from "axios";

function UserDashboard({ userId, user }) {
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					`https://mern-deploy-i7u8.onrender.com/api/users/${userId}/data`,
					{
						headers: {
							"x-auth-token": token,
						},
					}
				);
				setData(res.data); // data will now be a single object
			} catch (err) {
				console.error(
					"Failed to load user data:",
					err.response?.data || err.message
				);
			} finally {
				setLoading(false);
			}
		};

		if (userId) fetchData();
	}, [userId]);

	if (loading) return <p>Loading your data...</p>;

	return (
		<div>
			<h3>Your Info</h3>
			<ul>
				{/* <li>Email: {data.email}</li> */}
				<li>Username: {data.username}</li>
			</ul>
		</div>
	);
}

export default UserDashboard;
