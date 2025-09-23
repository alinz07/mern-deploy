// client/src/pages/CheckPage.js
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

export default function CheckPage() {
	const { dayId } = useParams();
	const [check, setCheck] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	// Ensure a Check exists for (dayId, user) and load it
	useEffect(() => {
		const run = async () => {
			try {
				// Create-or-get
				const createRes = await axios.post(
					"https://mern-deploy-i7u8.onrender.com/api/checks",
					{ dayId },
					tokenHeader()
				);
				setCheck(createRes.data);
			} catch (err) {
				const m =
					err.response?.data?.msg ||
					err.response?.data?.error ||
					"Unable to load or create check";
				setMsg(m);
			} finally {
				setLoading(false);
			}
		};
		run();
	}, [dayId]);

	const toggleField = useCallback(
		async (field) => {
			if (!check) return;
			const next = { ...check, [field]: !check[field] };
			try {
				const res = await axios.patch(
					`https://mern-deploy-i7u8.onrender.com/api/checks/${check._id}`,
					{ [field]: next[field] },
					tokenHeader()
				);
				setCheck(res.data);
				setMsg("");
			} catch (err) {
				const m =
					err.response?.data?.msg ||
					err.response?.data?.error ||
					"Update failed";
				setMsg(m);
			}
		},
		[check]
	);

	if (loading) return <p>Loading check…</p>;
	if (!check) return <p>{msg || "Check not found"}</p>;

	const fields = [
		["checkone", "Check One"],
		["checktwo", "Check Two"],
		["checkthree", "Check Three"],
		["checkfour", "Check Four"],
		["checkfive", "Check Five"],
	];

	return (
		<div style={{ maxWidth: 520 }}>
			<h2>Daily Check</h2>
			{msg && <p style={{ color: "crimson" }}>{msg}</p>}

			<ul style={{ listStyle: "none", padding: 0 }}>
				{fields.map(([key, label]) => (
					<li
						key={key}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							padding: "10px 0",
							borderBottom: "1px solid #eee",
						}}
					>
						<input
							id={key}
							type="checkbox"
							checked={!!check[key]}
							onChange={() => toggleField(key)}
						/>
						<label
							htmlFor={key}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{label}
						</label>
					</li>
				))}
			</ul>
		</div>
	);
}
