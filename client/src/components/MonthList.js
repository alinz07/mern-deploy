// client/src/components/MonthList.js  (DROP-IN)
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

function MonthList({ user }) {
	const [months, setMonths] = useState([]);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [selectedYear, setSelectedYear] = useState("all");
	const [isCreating, setIsCreating] = useState(false);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	// Utility: "MonthName YYYY"
	const getFormattedMonth = (offset = 0) => {
		const date = new Date();
		date.setMonth(date.getMonth() + offset);
		const mname = date.toLocaleString("default", { month: "long" });
		const year = date.getFullYear();
		return `${mname} ${year}`;
	};
	const currentMonthName = getFormattedMonth(0);
	const nextMonthName = getFormattedMonth(1);

	useEffect(() => {
		const fetchMonths = async () => {
			try {
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/months",
					tokenHeader()
				);
				setMonths(res.data || []);
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

	const doesMonthExist = (monthName) =>
		months.some((m) => m.name === monthName);

	const currentExists = doesMonthExist(currentMonthName);
	const nextExists = doesMonthExist(nextMonthName);

	const parseMonthDate = (name) => {
		const [monthName, year] = (name || "").split(" ");
		const date = new Date(`${monthName} 1, ${year}`);
		return date;
	};

	const uniqueYears = useMemo(
		() =>
			Array.from(
				new Set(months.map((m) => (m.name || "").split(" ")[1]))
			).sort(),
		[months]
	);

	const handleAddMonth = async (offset) => {
		const monthToAdd = getFormattedMonth(offset);
		setIsCreating(true);
		setMessage("");
		try {
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/months/new",
				{ name: monthToAdd },
				tokenHeader()
			);
			setMonths((prev) => [...prev, res.data]);
			setMessage(`✅ Added: ${monthToAdd}`);
		} catch (err) {
			const msg =
				err.response?.data?.msg ||
				err.response?.data?.error ||
				"Something went wrong";
			setMessage(`❌ ${msg}`);
		} finally {
			setIsCreating(false);
		}
	};

	if (loading) return <p>Loading months...</p>;

	const filtered = months
		.filter((m) =>
			selectedYear === "all"
				? true
				: (m.name || "").endsWith(selectedYear)
		)
		.sort((a, b) => parseMonthDate(a.name) - parseMonthDate(b.name));

	return (
		<div className="month-list">
			<h3>Your Months</h3>

			{/* Year Filter */}
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

			{message && <p className="message">{message}</p>}

			{/* Add Month (no day seeding now) */}
			<button
				onClick={() => handleAddMonth(0)}
				disabled={currentExists || isCreating}
				title={currentExists ? "Current month already added" : ""}
			>
				➕ Add Current Month
			</button>
			<button
				onClick={() => handleAddMonth(1)}
				disabled={nextExists || isCreating}
				title={nextExists ? "Next month already added" : ""}
			>
				➕ Add Next Month
			</button>

			{/* List */}
			{filtered.length === 0 ? (
				<p>
					No months found
					{selectedYear !== "all" ? ` for ${selectedYear}` : ""}.
				</p>
			) : (
				<ul>
					{filtered.map((month) => (
						<li key={month._id}>
							<Link to={`/months/${month._id}`}>
								{month.name}
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default MonthList;
