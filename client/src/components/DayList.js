// client/src/components/DayList.js  (DROP-IN)
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com";

export default function DayList() {
	const { monthId } = useParams();

	const [days, setDays] = useState([]);
	const [monthName, setMonthName] = useState("");
	const [monthOwnerId, setMonthOwnerId] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");
	const [viewer, setViewer] = useState(null);
	const [refreshing, setRefreshing] = useState(false);

	// controls for adding a day
	const [env, setEnv] = useState("online");
	const [dateStr, setDateStr] = useState(""); // YYYY-MM-DD
	const [submitting, setSubmitting] = useState(false);
	const [deleting, setDeleting] = useState({}); // { [dayId]: true }

	// client-side filter (All / online / inperson)
	const [filterEnv, setFilterEnv] = useState("all");

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	// helper: "Mon 9/1"
	const formatDayLabel = (monthName, dayNumber) => {
		if (!monthName) return String(dayNumber);
		const [mName, yStr] = monthName.split(" ");
		const d = new Date(`${mName} ${dayNumber}, ${yStr}`);
		if (isNaN(d)) return String(dayNumber);
		const wk = d.toLocaleDateString(undefined, { weekday: "short" });
		const md = d.toLocaleDateString(undefined, {
			month: "numeric",
			day: "numeric",
		});
		return `${wk} ${md}`;
	};

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			try {
				const [daysRes, monthRes, meRes] = await Promise.all([
					axios.get(
						`${API}/api/days?monthId=${monthId}`,
						tokenHeader(),
					),
					axios.get(`${API}/api/months/${monthId}`, tokenHeader()),
					axios.get(`${API}/api/auth/me`, tokenHeader()),
				]);

				setDays(daysRes.data || []);
				setMonthName(monthRes.data?.name || "");

				const ownerId =
					typeof monthRes.data?.userId === "object"
						? monthRes.data?.userId?._id
						: monthRes.data?.userId;

				setMonthOwnerId(ownerId || null);
				setViewer(meRes.data || null);
			} catch (e) {
				setMsg("Failed to load days");
			} finally {
				setLoading(false);
			}
		};

		if (monthId) load();
	}, [monthId]);

	useEffect(() => {
		const notice = sessionStorage.getItem("transcribeNotice");
		if (notice) {
			setMsg(notice);
			sessionStorage.removeItem("transcribeNotice");
		}
	}, []);

	const isAdmin = viewer?.role === "admin";
	const canSeeUserDetails = Boolean(monthOwnerId && isAdmin);

	// compute min/max strings for the date input (no UTC conversion)
	const dateBounds = useMemo(() => {
		if (!monthName) return { min: undefined, max: undefined };
		const [mName, yStr] = (monthName || "").split(" ");
		const y = Number(yStr);
		const monthIndex = new Date(`${mName} 1, ${y}`).getMonth();
		const first = new Date(y, monthIndex, 1);
		const last = new Date(y, monthIndex + 1, 0);

		const pad = (n) => String(n).padStart(2, "0");
		const toYMD = (d) =>
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

		return { min: toYMD(first), max: toYMD(last) };
	}, [monthName]);

	// only allow "Add Today" buttons when viewing the current month
	const isCurrentMonth = useMemo(() => {
		if (!monthName) return false;

		const parts = monthName.trim().split(/\s+/);
		if (parts.length < 2) return false;

		const [mName, yStr] = parts;
		const now = new Date();
		const currentMonthName = now.toLocaleString("default", {
			month: "long",
		});
		const currentYear = String(now.getFullYear());

		return mName === currentMonthName && yStr === currentYear;
	}, [monthName]);

	const refreshDays = async ({ showMessage = false } = {}) => {
		if (!monthId) return;
		setRefreshing(true);
		try {
			const res = await axios.get(
				`${API}/api/days?monthId=${monthId}`,
				tokenHeader(),
			);
			setDays(res.data || []);
			if (showMessage) setMsg("Days refreshed.");
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to refresh days";
			setMsg(m);
		} finally {
			setRefreshing(false);
		}
	};

	const createDay = async (dayNumber) => {
		if (!monthId || !dayNumber) return;
		setSubmitting(true);
		setMsg("");
		try {
			const body = {
				monthId,
				dayNumber,
				environment: env,
				userId: monthOwnerId, // safe to include; ignored for non-admins
			};
			const res = await axios.post(
				`${API}/api/days/add`,
				body,
				tokenHeader(),
			);
			await refreshDays();
			const action = res.data?.action;
			if (action === "updated") {
				setMsg("Existing day updated.");
			} else {
				setMsg(`Added day ${dayNumber} (${env}).`);
			}
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to add/update day";
			setMsg(m);
		} finally {
			setSubmitting(false);
		}
	};

	const handleAddToday = async () => {
		if (!monthId) return;
		setSubmitting(true);
		setMsg("");
		try {
			const res = await axios.post(
				`${API}/api/days/add-today`,
				{ monthId, environment: env, userId: monthOwnerId },
				tokenHeader(),
			);
			await refreshDays();
			const action = res.data?.action;
			if (action === "exists") {
				setMsg("Today already exists.");
			} else if (action === "updated") {
				setMsg("Existing day updated.");
			} else {
				setMsg(`Added today (${env}).`);
			}
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to add today";
			setMsg(m);
		} finally {
			setSubmitting(false);
		}
	};

	const handleAddTodayInperson = async () => {
		if (!monthId) return;
		setSubmitting(true);
		setMsg("");
		try {
			const res = await axios.post(
				`${API}/api/days/add-today`,
				{ monthId, environment: "inperson", userId: monthOwnerId },
				tokenHeader(),
			);
			await refreshDays();
			const action = res.data?.action;
			if (action === "exists") {
				setMsg("Today already exists.");
			} else if (action === "updated") {
				setMsg("Existing day updated.");
			} else {
				setMsg("Added today (inperson).");
			}
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to add today";
			setMsg(m);
		} finally {
			setSubmitting(false);
		}
	};

	const onSubmitAddDay = (e) => {
		e.preventDefault();
		if (!dateStr || !monthName) return;

		const [yyyy, mm, dd] = dateStr.split("-").map((s) => parseInt(s, 10));
		if (!yyyy || !mm || !dd) {
			setMsg("Invalid date");
			return;
		}

		const [mName, yStr] = monthName.split(" ");
		const monthIndex = new Date(`${mName} 1, ${yStr}`).getMonth();
		const selected = new Date(yyyy, mm - 1, dd);

		const sameMonth =
			selected.getMonth() === monthIndex &&
			selected.getFullYear().toString() === yStr;
		if (!sameMonth) {
			setMsg(`Please pick a date in ${monthName}.`);
			return;
		}
		createDay(dd);
	};

	const handleDeleteDay = async (day) => {
		if (!day?._id) return;
		const ok = window.confirm(
			`Delete ${monthName} ${day.dayNumber} [${
				day.environment || "online"
			}]? This will remove its checks and comments.`,
		);
		if (!ok) return;

		setDeleting((d) => ({ ...d, [day._id]: true }));
		setMsg("");
		try {
			await axios.delete(`${API}/api/days/${day._id}`, tokenHeader());
			await refreshDays();
			setMsg("Day deleted.");
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to delete day";
			setMsg(m);
		} finally {
			setDeleting((d) => {
				const { [day._id]: _omit, ...rest } = d;
				return rest;
			});
		}
	};

	const filteredDays = useMemo(() => {
		if (filterEnv === "all") return [...days];
		return days.filter((d) => (d.environment || "online") === filterEnv);
	}, [days, filterEnv]);

	if (loading) return <p className="day-list-loading">Loading days…</p>;

	return (
		<div className="day-list">
			<div className="day-list-panel">
				<div className="day-list-actions">
					{canSeeUserDetails && (
						<Link
							className="day-list-magenta-button"
							to={`/admin/users/${monthOwnerId}`}
						>
							Back to User Details
						</Link>
					)}
					<button
						type="button"
						className="day-list-magenta-button"
						onClick={() => refreshDays({ showMessage: true })}
						disabled={refreshing}
						title="Refresh days and transcription statuses"
					>
						{refreshing ? "Refreshing..." : "Refresh"}
					</button>
				</div>

				<header className="day-list-header">
					<h1>{monthName || "Days"}</h1>
					<div className="day-list-filter">
						<label htmlFor="day-environment-filter">Filter</label>
						<select
							id="day-environment-filter"
							value={filterEnv}
							onChange={(e) => setFilterEnv(e.target.value)}
						>
							<option value="all">All</option>
							<option value="online">Online</option>
							<option value="inperson">In-person</option>
						</select>
						<span>
							{filteredDays.length} of {days.length} days
						</span>
					</div>
				</header>

				{msg && <p className="message day-list-message">{msg}</p>}

				<section className="day-list-editor" aria-labelledby="day-editor-title">
					<h2 id="day-editor-title">Add or Update a Day</h2>
				<form
					onSubmit={onSubmitAddDay}
					className="day-list-form"
				>
					<label htmlFor="day-date">Date</label>
					<input
						id="day-date"
						type="date"
						value={dateStr}
						onChange={(e) => setDateStr(e.target.value)}
						min={dateBounds.min}
						max={dateBounds.max}
						required
						disabled={submitting || !monthName}
					/>
					<select
						aria-label="Day environment"
						value={env}
						onChange={(e) => setEnv(e.target.value)}
						disabled={submitting}
					>
						<option value="online">online</option>
						<option value="inperson">inperson</option>
					</select>
					<button type="submit" disabled={submitting}>
						Add/Update Day
					</button>
				</form>

				{isCurrentMonth && (
					<div className="day-list-today-actions">
						<span>or add today</span>
						<div>
							<button
								type="button"
								onClick={handleAddToday}
								disabled={submitting}
							>
								Add Today (online)
							</button>

							<button
								type="button"
								onClick={handleAddTodayInperson}
								disabled={submitting}
								title="Add today as in-person"
							>
								Add Today (in-person)
							</button>
						</div>
					</div>
				)}
				</section>

				<section className="day-list-days" aria-labelledby="days-heading">
					<h2 id="days-heading">Days</h2>
					{filteredDays.length === 0 ? (
						<p className="day-list-empty">
							No days{filterEnv !== "all" ? ` for '${filterEnv}'` : ""}.
						</p>
					) : (
					<ul className="day-list-items">
					{[...filteredDays]
						.sort((a, b) => a.dayNumber - b.dayNumber)
						.map((d) => (
							<li key={d._id} className="day-list-item">
								{(() => {
									const label = formatDayLabel(
										monthName,
										d.dayNumber,
									);
									const status = d?.transcription?.status;
									const locked =
										status === "queued" ||
										status === "processing";

									return locked ? (
										<span className="day-list-link day-list-link--locked">
											{label} <em>(Transcribing...)</em>
										</span>
									) : (
										<Link
											className="day-list-link"
											to={`/days/${
												d._id
											}/check?monthId=${monthId}${
												monthOwnerId
													? `&userId=${monthOwnerId}`
													: ""
											}`}
										>
											{label}
										</Link>
									);
								})()}

								<span className="day-list-environment">
									{d.environment === "inperson" ? "In-person" : "Online"}
								</span>

								<button
									className="day-list-delete"
									type="button"
									onClick={() => handleDeleteDay(d)}
									disabled={!!deleting[d._id]}
									title="Delete this day"
								>
									{deleting[d._id] ? "Deleting..." : "Delete"}
								</button>
							</li>
						))}
					</ul>
					)}
				</section>
			</div>
		</div>
	);
}
