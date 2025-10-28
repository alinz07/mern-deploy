// client/src/pages/CheckPage.js  (DROP-IN)
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com";

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

const EQUIP_FIELDS = [
	["left", "Left"],
	["right", "Right"],
	["both", "Both"],
	["fmMic", "FM Mic"],
];

export default function CheckPage() {
	const { dayId } = useParams();
	const [searchParams] = useSearchParams();
	const monthId = searchParams.get("monthId");
	// If an admin is acting for a student, this will be present.
	// For regular users on their own page, it's usually null.
	const userIdFromQuery = searchParams.get("userId");

	// Daily check
	const [check, setCheck] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");
	const [saving, setSaving] = useState({});
	const [bulkSaving, setBulkSaving] = useState(false);

	// Daily comments
	const [commentOpen, setCommentOpen] = useState({});
	const [commentText, setCommentText] = useState({});
	const [commentDoc, setCommentDoc] = useState({});
	const [commentSaving, setCommentSaving] = useState({});

	// Equipment
	const [equipAllowed, setEquipAllowed] = useState(true); // we only hide on hard 403
	const [echeck, setEcheck] = useState(null);
	const [equipSaving, setEquipSaving] = useState({});
	const [equipMsg, setEquipMsg] = useState("");

	// Equip comments
	const [eCmtOpen, setECmtOpen] = useState({});
	const [eCmtText, setECmtText] = useState({});
	const [eCmtDoc, setECmtDoc] = useState({});
	const [eCmtSaving, setECmtSaving] = useState({});

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	const fieldKeys = useMemo(() => FIELD_MAP.map(([k]) => k), []);

	// 1) Ensure a Check exists for this day (and user when admin passes userId)
	useEffect(() => {
		const run = async () => {
			setLoading(true);
			try {
				const body = userIdFromQuery
					? { dayId, userId: userIdFromQuery }
					: { dayId };
				const res = await axios.post(
					`${API}/api/checks`,
					body,
					tokenHeader()
				);
				setCheck(res.data);
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
	}, [dayId, userIdFromQuery]);

	// 2) Load all per-field comments; auto-open if a field already has text
	useEffect(() => {
		const load = async () => {
			if (!check?._id) return;
			try {
				const res = await axios.get(
					`${API}/api/comments/by-check/${check._id}/all`,
					tokenHeader()
				);
				const map = res.data || {};
				const openInit = {},
					textInit = {},
					docInit = {};
				for (const [field] of FIELD_MAP) {
					const doc = map[field] || null;
					docInit[field] = doc;
					const hasText =
						doc && (doc.commentText || "").trim().length > 0;
					openInit[field] = hasText;
					textInit[field] = hasText ? doc.commentText : "";
				}
				setCommentDoc(docInit);
				setCommentOpen(openInit);
				setCommentText(textInit);
			} catch {
				/* ignore */
			}
		};
		load();
	}, [check?._id]);

	/**
	 * 3) Load the EquipmentCheck row.
	 *
	 * IMPORTANT: resolve the user id we send to the API:
	 *   - If an admin is acting for a student → use userIdFromQuery
	 *   - Otherwise (regular users) → use the owner of the Day/Check (check.user)
	 *
	 * This ensures the backend sees the current user's own id, avoiding 403.
	 */
	const resolvedUserId = userIdFromQuery || check?.user || null;

	useEffect(() => {
		const loadEquip = async () => {
			// need month, day, and a resolved user id
			if (!monthId || !dayId || !resolvedUserId) return;
			try {
				const r = await axios.get(
					`${API}/api/equipment-checks/for-day`,
					{
						params: {
							month: monthId,
							day: dayId,
							user: resolvedUserId,
						},
						...tokenHeader(),
					}
				);
				setEcheck(r.data);
				setEquipAllowed(true);
				setEquipMsg("");
			} catch (e) {
				const code = e?.response?.status;
				if (code === 404) {
					// not created yet — show the Enable button for *everyone*
					setEcheck(null);
					setEquipAllowed(true);
					setEquipMsg("");
				} else if (code === 403) {
					// tenant/role guard — hide only if truly forbidden
					setEquipAllowed(false);
				} else {
					setEquipAllowed(true);
					setEquipMsg("Failed to load equipment check.");
				}
			}
		};
		loadEquip();
	}, [monthId, dayId, resolvedUserId]);

	// 4) When present, load per-field equipment comments
	useEffect(() => {
		const load = async () => {
			if (!echeck?._id) return;
			try {
				const res = await axios.get(
					`${API}/api/equip-comments/by-echeck/${echeck._id}/all`,
					tokenHeader()
				);
				const map = res.data || {};
				const openInit = {},
					textInit = {},
					docInit = {};
				for (const [field] of EQUIP_FIELDS) {
					const doc = map[field] || null;
					docInit[field] = doc;
					const hasText =
						doc && (doc.commentText || "").trim().length > 0;
					openInit[field] = hasText;
					textInit[field] = hasText ? doc.commentText : "";
				}
				setECmtDoc(docInit);
				setECmtOpen(openInit);
				setECmtText(textInit);
			} catch {
				// ignore
			}
		};
		load();
	}, [echeck?._id]);

	// --------- Daily check handlers ----------
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

	// --------- Comment handlers ----------
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

	// --------- Equipment handlers ----------
	// Everyone can press Enable; we always send the resolved owner id.
	const enableEquipmentCheck = async () => {
		try {
			const res = await axios.post(
				`${API}/api/equipment-checks`,
				{
					month: monthId,
					day: dayId,
					user: resolvedUserId, // <-- key change: use owner of the day when non-admin
					left: false,
					right: false,
					both: false,
					fmMic: false,
				},
				tokenHeader()
			);
			setEcheck(res.data);
			setEquipMsg("");
		} catch (e) {
			const code = e?.response?.status;
			if (code === 403) {
				// If this still hits, backend forbids; hide the panel.
				setEquipAllowed(false);
			} else {
				setEquipMsg(
					e?.response?.data?.msg || "Failed to enable equipment check"
				);
			}
		}
	};

	const toggleEquip = async (field) => {
		if (!echeck?._id || equipSaving[field]) return;
		setEquipSaving((s) => ({ ...s, [field]: true }));
		const prev = !!echeck[field];
		setEcheck((c) => ({ ...c, [field]: !prev }));
		try {
			const res = await axios.patch(
				`${API}/api/equipment-checks/${echeck._id}`,
				{ [field]: !prev },
				tokenHeader()
			);
			setEcheck(res.data);
			setEquipMsg("");
		} catch (e) {
			setEcheck((c) => ({ ...c, [field]: prev }));
			setEquipMsg(e?.response?.data?.msg || "Update failed");
		} finally {
			setEquipSaving((s) => ({ ...s, [field]: false }));
		}
	};

	const saveEquipComment = async (field) => {
		if (!echeck?._id || !eCmtText[field]?.trim()) return;
		setECmtSaving((s) => ({ ...s, [field]: true }));
		try {
			const res = await axios.put(
				`${API}/api/equip-comments/by-echeck/${echeck._id}`,
				{ field, commentText: eCmtText[field] },
				tokenHeader()
			);
			setECmtDoc((d) => ({ ...d, [field]: res.data }));
			setEquipMsg("Comment saved.");
		} catch (e) {
			setEquipMsg(e?.response?.data?.msg || "Failed to save comment");
		} finally {
			setECmtSaving((s) => ({ ...s, [field]: false }));
		}
	};

	const deleteEquipComment = async (field) => {
		if (!echeck?._id) return;
		setECmtSaving((s) => ({ ...s, [field]: true }));
		try {
			await axios.delete(
				`${API}/api/equip-comments/by-echeck/${echeck._id}`,
				{
					params: { field },
					...tokenHeader(),
				}
			);
			setECmtDoc((d) => ({ ...d, [field]: null }));
			setECmtText((t) => ({ ...t, [field]: "" }));
			setECmtOpen((o) => ({ ...o, [field]: false }));
			setEquipMsg("Comment deleted.");
		} catch (e) {
			setEquipMsg(e?.response?.data?.msg || "Failed to delete comment");
		} finally {
			setECmtSaving((s) => ({ ...s, [field]: false }));
		}
	};

	if (loading) return <p>Loading check…</p>;
	if (!check) return <p>{msg || "Check not found"}</p>;

	const checkedCount = fieldKeys.reduce((n, k) => n + (check[k] ? 1 : 0), 0);

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: equipAllowed ? "1fr 340px" : "1fr",
				gap: 24,
			}}
		>
			{/* LEFT: Daily Check */}
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
					<Link
						to={`/record?day=${dayId}&user=${
							resolvedUserId || ""
						}&month=${monthId || ""}`}
					>
						<button type="button" title="Open recording page">
							Record Sound
						</button>
					</Link>
					<span style={{ opacity: 0.7 }}>
						({checkedCount} / 10 complete)
					</span>
				</div>

				{msg && <p style={{ color: "crimson", marginTop: 8 }}>{msg}</p>}

				<table className="table">
					<thead>
						<tr>
							<th style={{ width: 180 }}>Field</th>
							<th style={{ width: 120 }}>Status</th>
							<th>Comments</th>
						</tr>
					</thead>
					<tbody>
						{FIELD_MAP.map(([field, label]) => (
							<tr key={field}>
								<td>{label}</td>
								<td>
									<button
										onClick={() => toggleField(field)}
										disabled={saving[field] || bulkSaving}
									>
										{check[field]
											? "✓ True (click to clear)"
											: "Mark True"}
									</button>
								</td>
								<td>
									<div
										style={{
											display: "flex",
											gap: 8,
											alignItems: "center",
											flexWrap: "wrap",
										}}
									>
										<button
											onClick={() =>
												setCommentOpen((o) => ({
													...o,
													[field]: !o[field],
												}))
											}
											type="button"
										>
											{commentOpen[field]
												? "Hide"
												: "Add/Show"}
										</button>
										{commentOpen[field] && (
											<div
												style={{
													display: "grid",
													gap: 6,
													width: "100%",
												}}
											>
												<textarea
													rows={2}
													placeholder={`Comment for ${label}`}
													value={
														commentText[field] || ""
													}
													onChange={(e) =>
														setCommentText((t) => ({
															...t,
															[field]:
																e.target.value,
														}))
													}
												/>
												<div
													style={{
														display: "flex",
														gap: 8,
													}}
												>
													<button
														onClick={() =>
															saveComment(field)
														}
														disabled={
															commentSaving[field]
														}
														type="button"
													>
														Save
													</button>
													{commentDoc[field] && (
														<button
															onClick={() =>
																deleteComment(
																	field
																)
															}
															disabled={
																commentSaving[
																	field
																]
															}
															type="button"
														>
															Delete
														</button>
													)}
												</div>
											</div>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>

				<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
					<button onClick={() => setAll(true)} disabled={bulkSaving}>
						Mark all
					</button>
					<button onClick={() => setAll(false)} disabled={bulkSaving}>
						Clear all
					</button>
				</div>
			</div>

			{/* RIGHT: Equipment Check */}
			{equipAllowed && (
				<aside
					style={{ borderLeft: "1px solid #ddd", paddingLeft: 16 }}
				>
					<h3 style={{ marginTop: 0 }}>Equipment Check</h3>
					{equipMsg && <p style={{ color: "crimson" }}>{equipMsg}</p>}
					{!echeck ? (
						<button type="button" onClick={enableEquipmentCheck}>
							Enable equipment check
						</button>
					) : (
						<>
							<table className="table">
								<thead>
									<tr>
										<th>Field</th>
										<th style={{ width: 130 }}>Status</th>
									</tr>
								</thead>
								<tbody>
									{EQUIP_FIELDS.map(([field, label]) => (
										<tr key={field}>
											<td>{label}</td>
											<td>
												<button
													onClick={() =>
														toggleEquip(field)
													}
													disabled={
														equipSaving[field]
													}
												>
													{echeck[field]
														? "✓ True (click to clear)"
														: "Mark True"}
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>

							<h4>Equipment Comments</h4>
							<table className="table">
								<thead>
									<tr>
										<th>Field</th>
										<th>Comment</th>
									</tr>
								</thead>
								<tbody>
									{EQUIP_FIELDS.map(([field, label]) => (
										<tr key={field}>
											<td>{label}</td>
											<td>
												<div
													style={{
														display: "flex",
														gap: 8,
														alignItems: "center",
														flexWrap: "wrap",
													}}
												>
													<button
														type="button"
														onClick={() =>
															setECmtOpen(
																(o) => ({
																	...o,
																	[field]:
																		!o[
																			field
																		],
																})
															)
														}
													>
														{eCmtOpen[field]
															? "Hide"
															: "Add/Show"}
													</button>
													{eCmtOpen[field] && (
														<div
															style={{
																display: "grid",
																gap: 6,
																width: "100%",
															}}
														>
															<textarea
																rows={2}
																placeholder={`Comment for ${label}`}
																value={
																	eCmtText[
																		field
																	] || ""
																}
																onChange={(e) =>
																	setECmtText(
																		(
																			t
																		) => ({
																			...t,
																			[field]:
																				e
																					.target
																					.value,
																		})
																	)
																}
															/>
															<div
																style={{
																	display:
																		"flex",
																	gap: 8,
																}}
															>
																<button
																	onClick={() =>
																		saveEquipComment(
																			field
																		)
																	}
																	disabled={
																		eCmtSaving[
																			field
																		]
																	}
																	type="button"
																>
																	Save
																</button>
																{eCmtDoc[
																	field
																] && (
																	<button
																		onClick={() =>
																			deleteEquipComment(
																				field
																			)
																		}
																		disabled={
																			eCmtSaving[
																				field
																			]
																		}
																		type="button"
																	>
																		Delete
																	</button>
																)}
															</div>
														</div>
													)}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</>
					)}
				</aside>
			)}
		</div>
	);
}
