// client/src/pages/CheckPage.js (DROP-IN)
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-i7u8.onrender.com";

const FIELD_MAP = [
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
];

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

	// per-field comment state
	const [commentOpen, setCommentOpen] = useState({}); // { field: bool }
	const [commentText, setCommentText] = useState({}); // { field: string }
	const [commentDoc, setCommentDoc] = useState({}); // { field: commentDoc|null }
	const [commentSaving, setCommentSaving] = useState({}); // { field: bool }

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	const fieldKeys = useMemo(() => FIELD_MAP.map(([k]) => k), []);

	// Ensure a Check exists for (dayId, [userId]) and load it
	useEffect(() => {
		const run = async () => {
			try {
				const body = userId ? { dayId, userId } : { dayId };
				const createRes = await axios.post(
					`${API}/api/checks`,
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

	// Load all per-field comments once we have a check
	useEffect(() => {
		const loadAll = async () => {
			if (!check?._id) return;
			try {
				const res = await axios.get(
					`${API}/api/comments/by-check/${check._id}/all`,
					tokenHeader()
				);
				const map = res.data || {};
				const openInit = {};
				const textInit = {};
				const docInit = {};
				for (const [field] of FIELD_MAP) {
					const doc = map[field] || null;
					docInit[field] = doc;
					// auto-open if comment exists with non-blank text
					const hasText =
						doc && (doc.commentText || "").trim().length > 0;
					openInit[field] = hasText;
					textInit[field] = hasText ? doc.commentText : "";
				}
				setCommentDoc(docInit);
				setCommentOpen(openInit);
				setCommentText(textInit);
			} catch {
				// non-fatal
			}
		};
		loadAll();
	}, [check?._id]);

	// Toggle a single checkbox field
	const toggleField = useCallback(
		async (field) => {
			if (!check || saving[field] || bulkSaving) return;
			setSaving((s) => ({ ...s, [field]: true }));
			const prev = check[field];
			setCheck((c) => ({ ...c, [field]: !prev }));
			try {
				const res = await axios.patch(
					`${API}/api/checks/${check._id}`,
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
					`${API}/api/checks/${check._id}`,
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

	// Save one field's comment
	const saveComment = async (field) => {
		if (!check?._id || !commentText[field]?.trim()) return;
		setCommentSaving((s) => ({ ...s, [field]: true }));
		try {
			const res = await axios.put(
				`${API}/api/comments/by-check/${check._id}`,
				{ field, commentText: commentText[field] },
				tokenHeader()
			);
			setCommentDoc((d) => ({ ...d, [field]: res.data }));
			setMsg("Comment saved.");
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to save comment";
			setMsg(m);
		} finally {
			setCommentSaving((s) => ({ ...s, [field]: false }));
		}
	};

	// Delete one field's comment
	const deleteComment = async (field) => {
		if (!check?._id) return;
		setCommentSaving((s) => ({ ...s, [field]: true }));
		try {
			await axios.delete(`${API}/api/comments/by-check/${check._id}`, {
				params: { field },
				...tokenHeader(),
			});
			setCommentDoc((d) => ({ ...d, [field]: null }));
			setCommentText((t) => ({ ...t, [field]: "" }));
			setCommentOpen((o) => ({ ...o, [field]: false }));
			setMsg("Comment deleted.");
		} catch (e) {
			const m =
				e?.response?.data?.msg ||
				e?.response?.data?.error ||
				"Failed to delete comment";
			setMsg(m);
		} finally {
			setCommentSaving((s) => ({ ...s, [field]: false }));
		}
	};

	if (loading) return <p>Loading check…</p>;
	if (!check) return <p>{msg || "Check not found"}</p>;

	const checkedCount = fieldKeys.reduce((n, k) => n + (check[k] ? 1 : 0), 0);

	return (
		<div style={{ maxWidth: 760 }}>
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

			{/* Checklist + per-field comments */}
			<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
				{FIELD_MAP.map(([field, label]) => {
					const isSaving = !!saving[field] || bulkSaving;
					const open = !!commentOpen[field];
					const doc = commentDoc[field];
					return (
						<li
							key={field}
							style={{
								padding: "10px 0",
								borderBottom: "1px solid #eee",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
								}}
							>
								<input
									id={field}
									type="checkbox"
									checked={!!check[field]}
									onChange={() => toggleField(field)}
									disabled={isSaving}
								/>
								<label
									htmlFor={field}
									style={{
										userSelect: "none",
										cursor: isSaving
											? "not-allowed"
											: "pointer",
									}}
								>
									{label}
								</label>

								{/* + / – toggle */}
								{!open && !doc && (
									<button
										type="button"
										onClick={() =>
											setCommentOpen((o) => ({
												...o,
												[field]: true,
											}))
										}
										title="Add a comment"
										style={{ marginLeft: 8 }}
									>
										[ + ]
									</button>
								)}
								{open && !doc && (
									<button
										type="button"
										onClick={() =>
											setCommentOpen((o) => ({
												...o,
												[field]: false,
											}))
										}
										title="Hide comment box"
										style={{ marginLeft: 8 }}
									>
										[ – ]
									</button>
								)}
							</div>

							{(open || doc) && (
								<div style={{ marginTop: 8, marginLeft: 28 }}>
									<textarea
										rows={3}
										style={{
											width: "100%",
											boxSizing: "border-box",
										}}
										placeholder="Write a comment…"
										value={commentText[field] || ""}
										onChange={(e) =>
											setCommentText((t) => ({
												...t,
												[field]: e.target.value,
											}))
										}
									/>
									<div
										style={{
											display: "flex",
											gap: 8,
											marginTop: 6,
										}}
									>
										<button
											type="button"
											onClick={() => saveComment(field)}
											disabled={
												commentSaving[field] ||
												!(
													commentText[field] || ""
												).trim()
											}
										>
											Save
										</button>
										{doc && (
											<button
												type="button"
												onClick={() =>
													deleteComment(field)
												}
												disabled={commentSaving[field]}
											>
												Delete
											</button>
										)}
										{commentSaving[field] && (
											<span
												aria-live="polite"
												style={{ fontSize: 12 }}
											>
												saving…
											</span>
										)}
									</div>

									{doc && (
										<div
											style={{
												marginTop: 6,
												fontSize: 12,
												opacity: 0.75,
											}}
										>
											Last saved:{" "}
											{new Date(
												doc.updatedAt || doc.createdAt
											).toLocaleString()}
										</div>
									)}
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
