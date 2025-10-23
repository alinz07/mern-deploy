// client/src/pages/CheckPage.js  (DROP-IN)
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
	const userId = searchParams.get("userId"); // student owner (when admin acts for user)

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

	// Equipment panel visibility
	const [equipAllowed, setEquipAllowed] = useState(true); // hide on 403
	// Equipment check row
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

	// 1) Ensure a Check exists and load it
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

	// 2) Load all daily comments; auto-open initially if text exists
	useEffect(() => {
		const loadAll = async () => {
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
					openInit[field] = hasText; // initial auto-open
					textInit[field] = hasText ? doc.commentText : "";
				}
				setCommentDoc(docInit);
				setCommentOpen(openInit);
				setCommentText(textInit);
			} catch {
				/* non-fatal */
			}
		};
		loadAll();
	}, [check?._id]);

	// 3) Try to load/create the EquipmentCheck (admin-only; hide if 403)
	useEffect(() => {
		const loadEquip = async () => {
			if (!monthId || !dayId || !userId) return; // need all three to resolve row
			try {
				const r = await axios.get(
					`${API}/api/equipment-checks/for-day`,
					{
						params: { month: monthId, day: dayId, user: userId },
						...tokenHeader(),
					}
				);
				setEcheck(r.data);
				setEquipAllowed(true);
				setEquipMsg("");
			} catch (e) {
				const code = e?.response?.status;
				if (code === 404) {
					setEcheck(null);
					setEquipAllowed(true);
					setEquipMsg("");
				} else if (code === 403) {
					setEquipAllowed(false); // not admin or tenant mismatch
				} else {
					setEquipAllowed(true);
					setEquipMsg("Failed to load equipment check.");
				}
			}
		};
		loadEquip();
	}, [monthId, dayId, userId]);

	const enableEquipmentCheck = async () => {
		try {
			const res = await axios.post(
				`${API}/api/equipment-checks`,
				{
					month: monthId,
					day: dayId,
					user: userId,
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
			if (code === 403) setEquipAllowed(false);
			else
				setEquipMsg(
					e?.response?.data?.msg || "Failed to enable equipment check"
				);
		}
	};

	// Load all equipComments when we have an echeck (auto-open initially if text exists)
	useEffect(() => {
		const loadECmts = async () => {
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
					openInit[field] = hasText; // initial auto-open
					textInit[field] = hasText ? doc.commentText : "";
				}
				setECmtDoc(docInit);
				setECmtOpen(openInit);
				setECmtText(textInit);
			} catch {
				// ignore
			}
		};
		loadECmts();
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
				{ params: { field }, ...tokenHeader() }
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
					{/* under your <h2>Daily Check …> header controls */}
					<Link
						to={`/record?day=${dayId}&user=${
							userId || check?.user
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

									{/* Always show toggle; now visibility depends only on `open` */}
									<button
										type="button"
										onClick={() =>
											setCommentOpen((o) => ({
												...o,
												[field]: !open,
											}))
										}
										title={
											open
												? "Hide comment box"
												: "Add a comment"
										}
										style={{ marginLeft: 8 }}
									>
										{open ? "[ – ]" : "[ + ]"}
									</button>
								</div>

								{open && (
									<div
										style={{ marginTop: 8, marginLeft: 28 }}
									>
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
												onClick={() =>
													saveComment(field)
												}
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
													disabled={
														commentSaving[field]
													}
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
													doc.updatedAt ||
														doc.createdAt
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

			{/* RIGHT: Equipment Check (admin-only) */}
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
							<ul
								style={{
									listStyle: "none",
									padding: 0,
									margin: 0,
								}}
							>
								{EQUIP_FIELDS.map(([f, label]) => {
									const saving = !!equipSaving[f];
									const open = !!eCmtOpen[f];
									const doc = eCmtDoc[f];
									return (
										<li
											key={f}
											style={{
												padding: "8px 0",
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
													id={`e_${f}`}
													type="checkbox"
													checked={!!echeck[f]}
													onChange={() =>
														toggleEquip(f)
													}
													disabled={saving}
												/>
												<label htmlFor={`e_${f}`}>
													{label}
												</label>

												{/* Always show toggle; visibility depends only on `open` */}
												<button
													type="button"
													onClick={() =>
														setECmtOpen((o) => ({
															...o,
															[f]: !open,
														}))
													}
													title={
														open
															? "Hide comment box"
															: "Add a comment"
													}
													style={{ marginLeft: 8 }}
												>
													{open ? "[ – ]" : "[ + ]"}
												</button>
											</div>

											{open && (
												<div
													style={{
														marginTop: 6,
														marginLeft: 26,
													}}
												>
													<textarea
														rows={2}
														style={{
															width: "100%",
															boxSizing:
																"border-box",
														}}
														placeholder="Equipment comment…"
														value={
															eCmtText[f] || ""
														}
														onChange={(e) =>
															setECmtText(
																(t) => ({
																	...t,
																	[f]: e
																		.target
																		.value,
																})
															)
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
															onClick={() =>
																saveEquipComment(
																	f
																)
															}
															disabled={
																eCmtSaving[f] ||
																!(
																	eCmtText[
																		f
																	] || ""
																).trim()
															}
														>
															Save
														</button>
														{doc && (
															<button
																type="button"
																onClick={() =>
																	deleteEquipComment(
																		f
																	)
																}
																disabled={
																	eCmtSaving[
																		f
																	]
																}
															>
																Delete
															</button>
														)}
														{eCmtSaving[f] && (
															<span
																aria-live="polite"
																style={{
																	fontSize: 12,
																}}
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
																doc.updatedAt ||
																	doc.createdAt
															).toLocaleString()}
														</div>
													)}
												</div>
											)}
										</li>
									);
								})}
							</ul>
						</>
					)}
				</aside>
			)}
		</div>
	);
}
