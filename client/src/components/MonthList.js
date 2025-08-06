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

	// Utility: Format "MonthName YYYY"
	const getFormattedMonth = (offset = 0) => {
		const date = new Date();
		date.setMonth(date.getMonth() + offset);
		const name = date.toLocaleString("default", { month: "long" });
		const year = date.getFullYear();
		return `${name} ${year}`;
	};

	const handleAddMonth = async (offset) => {
		const name = getFormattedMonth(offset);

		try {
			const token = localStorage.getItem("token");

			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/months/new",
				{ name },
				{ headers: { "x-auth-token": token } }
			);

			setMonths([...months, res.data]);
			setMessage(`✅ Added: ${name}`);
		} catch (err) {
			const msg = err.response?.data?.msg || "Something went wrong";
			setMessage(`❌ ${msg}`);
		}
	};

	if (loading) return <p>Loading months...</p>;

	return (
		<div className="month-list">
			<h3>Your Months</h3>

			{/* Message */}
			{message && <p className="message">{message}</p>}

			{/* Add buttons */}
			<button onClick={() => handleAddMonth(0)}>
				➕ Add Current Month
			</button>
			<button onClick={() => handleAddMonth(1)}>➕ Add Next Month</button>

			{/* Month list */}
			<ul>
				{months.map((month) => (
					<li key={month._id}>{month.name}</li>
				))}
			</ul>
		</div>
	);
}

export default MonthList;
