import React, { useEffect, useState } from "react";
import axios from "axios";

function MonthList({ user }) {
	const [months, setMonths] = useState([]);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");

	// Fetch months on mount
	useEffect(() => {
		const fetchMonths = async () => {
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
				console.error(
					"Failed to fetch months:",
					err.response?.data || err.message
				);
				setMessage("Error loading months");
			} finally {
				setLoading(false);
			}
		};

		fetchMonths();
	}, []);

	// Submit new month
	const onSubmit = async (e) => {
		e.preventDefault();
		if (!name.trim()) return;

		try {
			const token = localStorage.getItem("token");
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/months/new",
				{ name },
				{
					headers: { "x-auth-token": token },
				}
			);

			setMonths([...months, res.data]);
			setName("");
			setMessage("Month added successfully");
		} catch (err) {
			console.error(
				"Failed to add month:",
				err.response?.data || err.message
			);
			setMessage("Failed to add month");
		}
	};

	if (loading) return <p>Loading months...</p>;

	return (
		<div>
			<h2>
				{user.username === "admin"
					? "All Months (Admin)"
					: "Your Months"}
			</h2>

			<ul>
				{months.map((month) => (
					<li key={month._id}>{month.name}</li>
				))}
			</ul>

			<h3>Add a New Month</h3>
			<form onSubmit={onSubmit}>
				<input
					type="text"
					placeholder="Month name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
				/>
				<button type="submit">Add Month</button>
			</form>

			{message && <p className="message">{message}</p>}
		</div>
	);
}

export default MonthList;
