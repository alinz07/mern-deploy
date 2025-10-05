// client/src/pages/CheckPage.js (DROP-IN)
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";

export default function CheckPage() {
	const { dayId } = useParams();
	const [searchParams] = useSearchParams();
	const monthId = searchParams.get("monthId");
	const userId = searchParams.get("userId"); // admin can act on behalf of student

	const [check, setCheck] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");
	const [saving, setSaving] = useState({});
	const [bulkSaving, setBulkSaving] = useState(false);

	// single comment state
	const [comment, setComment] = useState(null); // the doc or null
	const [commentOpen, setCommentOpen] = useState(false);
	const [commentText, setCommentText] = useState("");
	const [commentSaving, setCommentSaving] = useState(false);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	const fields = useMemo(
		() => [
			["checkone", "Check One"],
			["checktwo", "Check Two"],
			["checkthree", "Check Three"],
			["checkfour", "Check Four"],
			["checkfive", "Check Five"],
			["checksix", "Check Six"],
			["checkseven", "Check Seven"],
			["checkeight", "Check Eight"],
			["checknine", "Check Nine"],
			["checkten", "Check Ten"],
		],
		[]
	);
	const fieldKeys = useMemo(() => fields.map(([k]) => k), [fields]);

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
				setMsg("");
			} catch (err) {
				const m =
					err?.response?.data?.msg ||
					err?.response?.data?.error ||
					"Unable to load or create check";
				setMsg(m);
			} finally {
				setLoading(false);
			}
		};
		run();
	}, [dayId, userId]);

	// Load single comment once we have a check
	useEffect(() => {
		const loadComment = async () => {
			if (!check?._id) return;
			try {
				const res = await axios.get(
					`https://mern-deploy-i7u8.onrender.com/api/comments/by-check/${check._id}`,
					tokenHeader()
				);
				setComment(res.data);
				if (res.data) {
					setCommentText(res.data.commentText || "");
					setCommentOpen(true); // auto-open when existing
				}
			} catch {
				// non-fatal
			}
		};
		loadComment();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [check?._id]);

	// Toggle a single field
	const toggleField = useCallback(
		async (field) => {
			if (!check || saving[field] || bulkSaving) return;
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
					err?.response?.data?.msg ||
					err?.response?.data?.error ||
					"Update failed";
				setMsg(m);
				setCheck((c) => ({ ...c, [field]: prev }));
			} finally {
				setSaving((s) => ({ ...s, [field]: false }));
			}
		},
		[check, saving, bulkSaving]
	);

	// Bulk set all fields
	const setAll = useCallback(
		async (value) => {
			if (!check || bulkSaving) return;
			setBulkSaving(true);
			setMsg("");
			const payload = fieldKeys.reduce(
				(acc, k) => ((acc[k] = value), acc),
				{}
			);
			const prevState = { ...check };
			setCheck((c) => ({ ...c, ...payload }));
			try {
				const res = await axios.patch(
					`https://mern-deploy-i7u8.onrender.com/api/checks/${check._id}`,
					payload,
					tokenHeader()
				);
				setCheck(res.data);
			} catch (err) {
				const m =
					err?.response?.data?.msg ||
					err?.response?.data?.error ||
					"Bulk update failed";
				setMsg(m);
				setCheck(prevState);
			} finally {
				setBulkSaving(false);
			}
		},
		[check, fieldKeys, bulkSaving]
	);

	// Save (upsert) the single comment
	const saveComment = async () => {
		if (!check?._id || !commentText.trim()) return;
		setCommentSaving(true);
		try {
			const res = await axios.put(
				`https://mern-deploy-i7u8.onrender.com/api/comments/by-check/${check._id}`,
				{ commentText },
				tokenHeader()
			);
			setComment(res.data);
			setCommentText(res.data.commentText || "");
			setMsg("Comment saved.");
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to save comment";
			setMsg(m);
		} finally {
			setCommentSaving(false);
		}
	};

	// Delete the single comment
	const deleteComment = async () => {
		if (!check?._id) return;
		setCommentSaving(true);
		try {
			await axios.delete(
				`https://mern-deploy-i7u8.onrender.com/api/comments/by-check/${check._id}`,
				tokenHeader()
			);
			setComment(null);
			setCommentText("");
			setMsg("Comment deleted.");
			setCommentOpen(false);
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to delete comment";
			setMsg(m);
		} finally {
			setCommentSaving(false);
		}
	};

	if (loading) return <p>Loading check…</p>;
	if (!check) return <p>{msg || "Check not found"}</p>;

	const checkedCount = fieldKeys.reduce((n, k) => n + (check[k] ? 1 : 0), 0);

	return (
		<div style={{ maxWidth: 700 }}>
			<p style={{ marginBottom: 12 }}>
				<Link to={monthId ? `/months/${monthId}` : `/`}>
					← Back to DayList
				</Link>
			</p>

			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					gap: 12,
					flexWrap: "wrap",
				}}
			>
				<h2 style={{ margin: 0 }}>Daily Check</h2>
				<span style={{ opacity: 0.7 }}>
					({checkedCount} / 10 complete)
				</span>
			</div>

			{msg && <p style={{ color: "crimson", marginTop: 8 }}>{msg}</p>}

			{/* Bulk actions */}
			<div style={{ display: "flex", gap: 8, margin: "12px 0 8px" }}>
				<button
					type="button"
					onClick={() => setAll(true)}
					disabled={bulkSaving}
				>
					Mark all complete
				</button>
				<button
					type="button"
					onClick={() => setAll(false)}
					disabled={bulkSaving}
				>
					Clear all
				</button>
				{bulkSaving && (
					<span aria-live="polite" style={{ fontSize: 12 }}>
						saving…
					</span>
				)}
			</div>

			{/* Checklist */}
			<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
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
							disabled={!!saving[key] || bulkSaving}
						/>
						<label
							htmlFor={key}
							style={{
								userSelect: "none",
								cursor:
									saving[key] || bulkSaving
										? "not-allowed"
										: "pointer",
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

			{/* Single Comment */}
			<div
				style={{
					marginTop: 18,
					borderTop: "1px solid #ddd",
					paddingTop: 12,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<h3 style={{ margin: 0 }}>Comment</h3>
					{!commentOpen && !comment && (
						<button
							type="button"
							onClick={() => setCommentOpen(true)}
							title="Add a comment"
						>
							[ + ] Comment
						</button>
					)}
					{commentOpen && !comment && (
						<button
							type="button"
							onClick={() => setCommentOpen(false)}
							title="Hide comment box"
						>
							[ – ] Hide
						</button>
					)}
				</div>

				{(commentOpen || comment) && (
					<div style={{ marginTop: 10 }}>
						<textarea
							rows={4}
							style={{ width: "100%", boxSizing: "border-box" }}
							placeholder="Write a comment…"
							value={commentText}
							onChange={(e) => setCommentText(e.target.value)}
						/>
						<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
							<button
								type="button"
								onClick={saveComment}
								disabled={commentSaving || !commentText.trim()}
							>
								Save
							</button>
							{comment && (
								<button
									type="button"
									onClick={deleteComment}
									disabled={commentSaving}
								>
									Delete
								</button>
							)}
							{commentSaving && (
								<span
									aria-live="polite"
									style={{ fontSize: 12 }}
								>
									saving…
								</span>
							)}
						</div>

						{/* readback of current value */}
						{comment && (
							<div
								style={{
									marginTop: 10,
									fontSize: 13,
									opacity: 0.8,
								}}
							>
								Last saved:{" "}
								{new Date(
									comment.updatedAt || comment.createdAt
								).toLocaleString()}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
