import React, { useEffect, useState } from "react";
import axios from "axios";

function MonthList({ user }) {
	const [months, setMonths] = useState([]);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [selectedYear, setSelectedYear] = useState("all");

	// Utility: Format "MonthName YYYY"
	const getFormattedMonth = (offset = 0) => {
		const date = new Date();
		date.setMonth(date.getMonth() + offset);
		const name = date.toLocaleString("default", { month: "long" });
		const year = date.getFullYear();
		return `${name} ${year}`;
	};

	const doesMonthExist = (monthName) =>
		months.some((m) => m.name === monthName);

	const currentMonthName = getFormattedMonth(0);
	const nextMonthName = getFormattedMonth(1);

	const currentExists = doesMonthExist(currentMonthName);
	const nextExists = doesMonthExist(nextMonthName);

	const parseMonthDate = (name) => {
		// Expects format "August 2025"
		const [monthName, year] = name.split(" ");
		const date = new Date(`${monthName} 1, ${year}`);
		return date;
	};

	const uniqueYears = Array.from(
		new Set(months.map((m) => m.name.split(" ")[1]))
	).sort();

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

	const filtered = months
		.filter((m) => {
			if (selectedYear === "all") return true;
			return m.name.endsWith(selectedYear);
		})
		.sort((a, b) => parseMonthDate(a.name) - parseMonthDate(b.name));

	return (
		<div className="month-list">
			<h3>Your Months</h3>

			{/* Year Filter Dropdown */}
			<label>Filter by Year: </label>
			<select
				value={selectedYear}
				onChange={(e) => setSelectedYear(e.target.value)}
			>
				<option value="all">All</option>
				{uniqueYears.map((year) => (
					<option key={year} value={year}>
						{year}
					</option>
				))}
			</select>

			{/* Feedback */}
			{message && <p className="message">{message}</p>}

			{/* Add Buttons */}
			<button
				onClick={() => handleAddMonth(0)}
				disabled={currentExists}
				title={currentExists ? "Current month already added" : ""}
			>
				➕ Add Current Month
			</button>
			<button
				onClick={() => handleAddMonth(1)}
				disabled={nextExists}
				title={currentExists ? "Next month already added" : ""}
			>
				➕ Add Next Month
			</button>

			{/* Sorted & Filtered List */}
			{filtered.length === 0 ? (
				<p>
					No months found
					{selectedYear !== "all" ? ` for ${selectedYear}` : ""}.
				</p>
			) : (
				<ul>
					{filtered.map((month) => (
						<li key={month._id}>{month.name}</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default MonthList;
