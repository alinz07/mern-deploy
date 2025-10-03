// CheckPage.js (DROP-IN)
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";

export default function CheckPage() {
	const { dayId } = useParams();
	const [searchParams] = useSearchParams();
	const monthId = searchParams.get("monthId");
	const userId = searchParams.get("userId"); // <-- NEW

	const [check, setCheck] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");
	const [saving, setSaving] = useState({});

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	// Ensure a Check exists for (dayId, [userId]) and load it
	useEffect(() => {
		const run = async () => {
			try {
				const body = userId ? { dayId, userId } : { dayId };
				const createRes = await axios.post(
					"https://mern-deploy-i7u8.onrender.com/api/checks",
					body,
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
	}, [dayId, userId]);

	const toggleField = useCallback(
		async (field) => {
			if (!check || saving[field]) return;
			setSaving((s) => ({ ...s, [field]: true }));
			const prev = check[field];
			setCheck((c) => ({ ...c, [field]: !prev }));
			try {
				const res = await axios.patch(
					`https://mern-deploy-i7u8.onrender.com/api/checks/${check._id}`,
					{ [field]: !prev },
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
				setCheck((c) => ({ ...c, [field]: prev })); // rollback
			} finally {
				setSaving((s) => ({ ...s, [field]: false }));
			}
		},
		[check, saving]
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
			<p style={{ marginBottom: 12 }}>
				<Link to={monthId ? `/months/${monthId}` : `/`}>
					← Back to DayList
				</Link>
			</p>

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
							disabled={!!saving[key]}
						/>
						<label
							htmlFor={key}
							style={{
								userSelect: "none",
								cursor: saving[key] ? "not-allowed" : "pointer",
							}}
						>
							{label}
						</label>
						{saving[key] && (
							<span aria-live="polite" style={{ fontSize: 12 }}>
								saving…
							</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
