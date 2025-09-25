import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { Link } from "react-router-dom";

function MonthList({ user }) {
	const [months, setMonths] = useState([]);
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [selectedYear, setSelectedYear] = useState("all");

	// NEW: creation/loading state
	const [isCreating, setIsCreating] = useState(false);
	const [progressMsg, setProgressMsg] = useState("");

	// Utility: Format "MonthName YYYY"
	const getFormattedMonth = (offset = 0) => {
		const date = new Date();
		date.setMonth(date.getMonth() + offset);
		const mname = date.toLocaleString("default", { month: "long" });
		const year = date.getFullYear();
		return `${mname} ${year}`;
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

	const uniqueYears = useMemo(
		() =>
			Array.from(new Set(months.map((m) => m.name.split(" ")[1]))).sort(),
		[months]
	);

	// Fetch months on mount
	useEffect(() => {
		const fetchMonths = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/months",
					{ headers: { "x-auth-token": token } }
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

	// NEW: poll until all 31 days are visible to this user
	const waitForDays = async (
		monthId,
		expected,
		maxMs = 20000,
		intervalMs = 700
	) => {
		const token = localStorage.getItem("token");
		const start = Date.now();

		while (Date.now() - start < maxMs) {
			try {
				const res = await axios.get(
					`https://mern-deploy-i7u8.onrender.com/api/days?monthId=${monthId}`,
					{ headers: { "x-auth-token": token } }
				);
				const count = Array.isArray(res.data) ? res.data.length : 0;
				setProgressMsg(
					`Finishing setup… created ${Math.min(
						count,
						expected
					)}/${expected} days`
				);
				if (count >= expected) return true;
			} catch (e) {
				// Keep trying; transient 500s are ok while upserts run
			}
			await new Promise((r) => setTimeout(r, intervalMs));
		}
		return false; // timed out
	};

	const daysInMonthFromName = (name) => {
		if (!name) return 31;
		const [mName, yStr] = name.split(" ");
		const dt = new Date(`${mName} 1, ${yStr}`);
		if (isNaN(dt)) return 31;
		return new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
	};

	const handleAddMonth = async (offset) => {
		const monthToAdd = getFormattedMonth(offset);
		setIsCreating(true);
		setProgressMsg("Creating month…");

		try {
			const token = localStorage.getItem("token");
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/months/new",
				{ name: monthToAdd },
				{ headers: { "x-auth-token": token } }
			);

			// Update list immediately so link appears
			setMonths((prev) => [...prev, res.data]);
			setMessage(`✅ Added: ${monthToAdd}`);

			// If server indicates not all days are yet visible, poll until 31 are ready
			const telemetry = res.data?._telemetry;
			const expected =
				telemetry?.expected ?? daysInMonthFromName(res.data?.name);
			if (telemetry?.missingForCaller?.length) {
				setProgressMsg("Finishing setup… creating days");
				await waitForDays(res.data._id, expected);
			}
		} catch (err) {
			const msg =
				err.response?.data?.msg ||
				err.response?.data?.error ||
				"Something went wrong";
			setMessage(`❌ ${msg}`);
		} finally {
			setIsCreating(false);
			setProgressMsg("");
		}
	};

	if (loading) return <p>Loading months...</p>;

	const filtered = months
		.filter((m) =>
			selectedYear === "all" ? true : m.name.endsWith(selectedYear)
		)
		.sort((a, b) => parseMonthDate(a.name) - parseMonthDate(b.name));

	return (
		<div className="month-list" style={{ position: "relative" }}>
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

			{/* Sorted & Filtered List */}
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

			{/* NEW: Full-screen-ish overlay while creating */}
			{isCreating && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.45)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 9999,
					}}
				>
					<div
						style={{
							background: "white",
							borderRadius: 12,
							padding: "20px 28px",
							boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
							display: "flex",
							alignItems: "center",
							gap: 14,
							minWidth: 260,
						}}
					>
						{/* Simple CSS spinner */}
						<div
							style={{
								width: 28,
								height: 28,
								border: "3px solid #ddd",
								borderTopColor: "#444",
								borderRadius: "50%",
								animation: "spin 0.9s linear infinite",
							}}
						/>
						<div style={{ fontWeight: 600 }}>
							{progressMsg || "Working…"}
						</div>
					</div>

					{/* inline keyframes */}
					<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
				</div>
			)}
		</div>
	);
}

export default MonthList;
