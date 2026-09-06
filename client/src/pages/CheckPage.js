// client/src/pages/CheckPage.js  (DROP-IN)
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
	useParams,
	useSearchParams,
	Link,
	useNavigate,
} from "react-router-dom";
import axios from "axios";
import RecordingPage from "./RecordingPage";

const API = "https://mern-deploy-docker.onrender.com";

const FIELD_MAP = [
	["checkone", "u (oo)"],
	["checktwo", "a (ah)"],
	["checkthree", "i (ee)"],
	["checkfour", "s (s)"],
	["checkfive", "ʃ (sh)"],
	["checksix", "m (m)"],
	["checkseven", "n (n)"],
	["checkeight", "dʒ (j)"],
	["checknine", "z (z)"],
	["checkten", "h (h)"],
];

// 1 inch ≈ 96 CSS pixels
const SOUND_IMAGE_MAP = {
	checkone: "/sounds/oo.png",
	checktwo: "/sounds/aa.png",
	checkthree: "/sounds/ee.png",
	checkfour: "/sounds/ss.png",
	checkfive: "/sounds/sh.png",
	checksix: "/sounds/mm.png",
	checkseven: "/sounds/nn.png",
	checkeight: "/sounds/jj.png",
	checknine: "/sounds/zz.png",
	checkten: "/sounds/hh.png",
};

const EQUIP_FIELDS = [
	["left", "Left"],
	["right", "Right"],
	["fmMic", "FM Mic"],
];

const CHECK_SAVE_DEBOUNCE_MS = 450;

export default function CheckPage() {
	const { dayId } = useParams();
	const [searchParams] = useSearchParams();
	const monthId = searchParams.get("monthId");
	const userIdFromQuery = searchParams.get("userId");
	const navigate = useNavigate();

	// Daily check
	const [check, setCheck] = useState(null);
	const [loading, setLoading] = useState(true);
	const [msg, setMsg] = useState("");
	const [bulkSaving, setBulkSaving] = useState(false);

	// Daily comments
	const [commentOpen, setCommentOpen] = useState({});
	const [commentText, setCommentText] = useState({});
	const [commentDoc, setCommentDoc] = useState({});
	const [commentSaving, setCommentSaving] = useState({});

	// Equipment
	const [equipAllowed, setEquipAllowed] = useState(true);
	const [echeck, setEcheck] = useState(null);
	const [equipSaving, setEquipSaving] = useState({});
	const [equipMsg, setEquipMsg] = useState("");

	// Equip comments
	const [eCmtOpen, setECmtOpen] = useState({});
	const [eCmtText, setECmtText] = useState({});
	const [eCmtDoc, setECmtDoc] = useState({});
	const [eCmtSaving, setECmtSaving] = useState({});

	// lock ui for transcriptions
	const [uiLocked, setUiLocked] = useState(false);

	// day-level lock
	const [dayLocked, setDayLocked] = useState(false);
	const [lockSaving, setLockSaving] = useState(false);

	// logged-in viewer determines dashboard link text
	const [viewer, setViewer] = useState(null);

	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	const fieldKeys = useMemo(() => FIELD_MAP.map(([k]) => k), []);
	const checkRef = useRef(null);
	const checkIdRef = useRef(null);
	const checkSaveTimerRef = useRef(null);
	const checkSaveInFlightRef = useRef(false);
	const checkSaveGenerationRef = useRef(0);
	const pendingCheckPatchRef = useRef({});
	const previousCheckValuesRef = useRef({});

	useEffect(() => {
		const nextCheckId = check?._id || null;
		const previousCheckId = checkIdRef.current;
		if (
			previousCheckId &&
			nextCheckId &&
			String(previousCheckId) !== String(nextCheckId)
		) {
			if (checkSaveTimerRef.current) {
				clearTimeout(checkSaveTimerRef.current);
				checkSaveTimerRef.current = null;
			}
			checkSaveGenerationRef.current += 1;
			pendingCheckPatchRef.current = {};
			previousCheckValuesRef.current = {};
		}
		checkRef.current = check;
		checkIdRef.current = nextCheckId;
	}, [check]);

	useEffect(() => {
		return () => {
			if (checkSaveTimerRef.current) {
				clearTimeout(checkSaveTimerRef.current);
			}
		};
	}, []);

	// Load logged-in viewer for dashboard link label
	useEffect(() => {
		let cancelled = false;

		const loadViewer = async () => {
			try {
				const res = await axios.get(
					`${API}/api/auth/me`,
					tokenHeader(),
				);
				if (!cancelled) setViewer(res.data || null);
			} catch {
				if (!cancelled) setViewer(null);
			}
		};

		loadViewer();
		return () => {
			cancelled = true;
		};
	}, []);

	// 1) Ensure a Check exists for this day
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
					tokenHeader(),
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

	// 2) Load all per-field comments
	useEffect(() => {
		const load = async () => {
			if (!check?._id) return;
			try {
				const res = await axios.get(
					`${API}/api/comments/by-check/${check._id}/all`,
					tokenHeader(),
				);
				const map = res.data || {};
				const openInit = {};
				const textInit = {};
				const docInit = {};
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
				// ignore
			}
		};
		load();
	}, [check?._id]);

	const resolvedUserId = userIdFromQuery || check?.user || null;
	const isAdmin = viewer?.role === "admin";

	const dayLockedForViewer = dayLocked && !isAdmin;

	const openCheckCommentDraft = useCallback(
		(field) => {
			setCommentOpen((o) => ({ ...o, [field]: true }));
		},
		[],
	);

	const openEquipCommentDraft = useCallback(
		(field) => {
			setECmtOpen((o) => ({ ...o, [field]: true }));
		},
		[],
	);

	// 3) Load equipment row
	useEffect(() => {
		const loadEquip = async () => {
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
					},
				);
				if (r.data) {
					setEcheck(r.data);
				} else {
					const created = await axios.post(
						`${API}/api/equipment-checks`,
						{
							month: monthId,
							day: dayId,
							user: resolvedUserId,
						},
						tokenHeader(),
					);
					setEcheck(created.data);
				}
				setEquipAllowed(true);
				setEquipMsg("");
			} catch (e) {
				const code = e?.response?.status;
				if (code === 404) {
					try {
						const created = await axios.post(
							`${API}/api/equipment-checks`,
							{
								month: monthId,
								day: dayId,
								user: resolvedUserId,
							},
							tokenHeader(),
						);
						setEcheck(created.data);
						setEquipAllowed(true);
						setEquipMsg("");
					} catch {
						setEcheck(null);
						setEquipAllowed(true);
						setEquipMsg("Failed to load equipment check.");
					}
				} else if (code === 403) {
					setEquipAllowed(false);
				} else {
					setEquipAllowed(true);
					setEquipMsg("Failed to load equipment check.");
				}
			}
		};
		loadEquip();
	}, [monthId, dayId, resolvedUserId]);

	// 4) Load equipment comments
	useEffect(() => {
		const load = async () => {
			if (!echeck?._id) return;
			try {
				const res = await axios.get(
					`${API}/api/equip-comments/by-echeck/${echeck._id}/all`,
					tokenHeader(),
				);
				const map = res.data || {};
				const openInit = {};
				const textInit = {};
				const docInit = {};
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

	// 5) Day lock + transcription lock
	useEffect(() => {
		let cancelled = false;

		const checkLock = async () => {
			try {
				const res = await axios.get(`${API}/api/days/${dayId}`, {
					headers: { "x-auth-token": localStorage.getItem("token") },
				});

				const st = res.data?.transcription?.status;
				const locked = st === "queued" || st === "processing";
				const wholeDayLocked =
					res.data?.editingLock?.dayLocked === true;

				if (!cancelled) {
					setDayLocked(wholeDayLocked);
				}

				if (!cancelled && locked) {
					sessionStorage.setItem(
						"transcribeNotice",
						"⚠️ That day is currently transcribing in the background. Please wait until it finishes.",
					);
					navigate(`/months/${monthId}`);
				}
			} catch (e) {
				console.error("[CheckPage] day lock check failed", e);
			}
		};

		checkLock();
		return () => {
			cancelled = true;
		};
	}, [dayId, monthId, navigate]);

	// --------- Daily check handlers ----------
	const flushCheckPatch = useCallback(async () => {
		if (checkSaveTimerRef.current) {
			clearTimeout(checkSaveTimerRef.current);
			checkSaveTimerRef.current = null;
		}

		if (checkSaveInFlightRef.current) {
			checkSaveTimerRef.current = setTimeout(() => {
				checkSaveTimerRef.current = null;
				flushCheckPatch();
			}, CHECK_SAVE_DEBOUNCE_MS);
			return;
		}

		const checkId = checkIdRef.current;
		const payload = { ...pendingCheckPatchRef.current };
		const fields = Object.keys(payload);
		if (!checkId || fields.length === 0) return;

		pendingCheckPatchRef.current = {};
		checkSaveInFlightRef.current = true;
		const saveGeneration = checkSaveGenerationRef.current;

		try {
			const res = await axios.patch(
				`${API}/api/checks/${checkId}`,
				payload,
				{
					headers: {
						"x-auth-token": localStorage.getItem("token"),
					},
				},
			);

			if (saveGeneration === checkSaveGenerationRef.current) {
				const nextCheck = { ...(checkRef.current || {}) };
				fields.forEach((field) => {
					if (
						Object.prototype.hasOwnProperty.call(
							pendingCheckPatchRef.current,
							field,
						)
					) {
						return;
					}
					nextCheck[field] = res.data?.[field] ?? payload[field];
					delete previousCheckValuesRef.current[field];
				});
				checkRef.current = nextCheck;
				setCheck((current) =>
					current && String(current._id) === String(checkId)
						? { ...current, ...nextCheck }
						: current,
				);
				setMsg("");
			}
		} catch (err) {
			const m =
				err?.response?.data?.msg ||
				err?.response?.data?.error ||
				"Update failed";
			setMsg(m);

			if (saveGeneration === checkSaveGenerationRef.current) {
				const rollback = {};
				fields.forEach((field) => {
					if (
						Object.prototype.hasOwnProperty.call(
							pendingCheckPatchRef.current,
							field,
						)
					) {
						return;
					}
					if (
						Object.prototype.hasOwnProperty.call(
							previousCheckValuesRef.current,
							field,
						)
					) {
						rollback[field] = previousCheckValuesRef.current[field];
						delete previousCheckValuesRef.current[field];
					}
				});

				if (Object.keys(rollback).length > 0) {
					checkRef.current = {
						...(checkRef.current || {}),
						...rollback,
					};
					setCheck((current) =>
						current && String(current._id) === String(checkId)
							? { ...current, ...rollback }
							: current,
					);
				}
			}
		} finally {
			checkSaveInFlightRef.current = false;
			if (Object.keys(pendingCheckPatchRef.current).length > 0) {
				checkSaveTimerRef.current = setTimeout(() => {
					checkSaveTimerRef.current = null;
					flushCheckPatch();
				}, CHECK_SAVE_DEBOUNCE_MS);
			}
		}
	}, []);

	const scheduleCheckPatch = useCallback(() => {
		if (checkSaveTimerRef.current) {
			clearTimeout(checkSaveTimerRef.current);
		}
		checkSaveTimerRef.current = setTimeout(() => {
			checkSaveTimerRef.current = null;
			flushCheckPatch();
		}, CHECK_SAVE_DEBOUNCE_MS);
	}, [flushCheckPatch]);

	const toggleField = useCallback(
		(field) => {
			const currentCheck = checkRef.current;
			if (!currentCheck || bulkSaving || dayLockedForViewer) return;

			const prev = !!currentCheck[field];
			const next = !prev;

			if (
				!Object.prototype.hasOwnProperty.call(
					previousCheckValuesRef.current,
					field,
				)
			) {
				previousCheckValuesRef.current[field] = prev;
			}

			pendingCheckPatchRef.current[field] = next;
			checkRef.current = { ...currentCheck, [field]: next };
			setCheck((c) => (c ? { ...c, [field]: next } : c));
			if (next === false) openCheckCommentDraft(field);
			setMsg("");
			scheduleCheckPatch();
		},
		[
			bulkSaving,
			dayLockedForViewer,
			openCheckCommentDraft,
			scheduleCheckPatch,
		],
	);

	const setAll = useCallback(
		async (value) => {
			if (!check || bulkSaving || dayLockedForViewer) return;
			if (checkSaveTimerRef.current) {
				clearTimeout(checkSaveTimerRef.current);
				checkSaveTimerRef.current = null;
			}
			checkSaveGenerationRef.current += 1;
			pendingCheckPatchRef.current = {};
			previousCheckValuesRef.current = {};
			setBulkSaving(true);
			setMsg("");
			const payload = fieldKeys.reduce((acc, k) => {
				acc[k] = value;
				return acc;
			}, {});
			const prevState = { ...check };
			checkRef.current = { ...check, ...payload };
			setCheck((c) => ({ ...c, ...payload }));
			try {
				const res = await axios.patch(
					`${API}/api/checks/${check._id}`,
					payload,
					tokenHeader(),
				);
				checkRef.current = res.data;
				setCheck(res.data);
				if (value === false) {
					fieldKeys.forEach(openCheckCommentDraft);
				}
			} catch (err) {
				const m =
					err?.response?.data?.msg ||
					err?.response?.data?.error ||
					"Bulk update failed";
				setMsg(m);
				checkRef.current = prevState;
				setCheck(prevState);
			} finally {
				setBulkSaving(false);
			}
		},
		[check, fieldKeys, bulkSaving, dayLockedForViewer, openCheckCommentDraft],
	);

	const toggleDayLock = async (nextLocked) => {
		if (!isAdmin || lockSaving) return;

		setLockSaving(true);
		try {
			const res = await axios.patch(
				`${API}/api/days/${dayId}/day-lock`,
				{ dayLocked: nextLocked },
				tokenHeader(),
			);

			setDayLocked(res.data?.editingLock?.dayLocked === true);
			setMsg("");
		} catch (err) {
			const m =
				err?.response?.data?.msg ||
				err?.response?.data?.error ||
				"Failed to update day lock";
			setMsg(m);
		} finally {
			setLockSaving(false);
		}
	};

	// --------- Comment handlers ----------
	const saveComment = async (field) => {
		if (!check?._id || !commentText[field]?.trim() || dayLockedForViewer)
			return;
		setCommentSaving((s) => ({ ...s, [field]: true }));
		try {
			const res = await axios.put(
				`${API}/api/comments/by-check/${check._id}`,
				{ field, commentText: commentText[field] },
				tokenHeader(),
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
		if (!check?._id || dayLockedForViewer) return;
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
		if (!echeck?._id || equipSaving[field] || dayLockedForViewer) return;
		setEquipSaving((s) => ({ ...s, [field]: true }));
		const prev = !!echeck[field];
		const next = !prev;
		setEcheck((c) => ({ ...c, [field]: !prev }));
		try {
			const res = await axios.patch(
				`${API}/api/equipment-checks/${echeck._id}`,
				{ [field]: next },
				tokenHeader(),
			);
			setEcheck(res.data);
			if (next === false) openEquipCommentDraft(field);
			setEquipMsg("");
		} catch (e) {
			setEcheck((c) => ({ ...c, [field]: prev }));
			setEquipMsg(e?.response?.data?.msg || "Update failed");
		} finally {
			setEquipSaving((s) => ({ ...s, [field]: false }));
		}
	};

	const saveEquipComment = async (field) => {
		if (!echeck?._id || !eCmtText[field]?.trim() || dayLockedForViewer)
			return;
		setECmtSaving((s) => ({ ...s, [field]: true }));
		try {
			const res = await axios.put(
				`${API}/api/equip-comments/by-echeck/${echeck._id}`,
				{ field, commentText: eCmtText[field] },
				tokenHeader(),
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
		if (!echeck?._id || dayLockedForViewer) return;
		setECmtSaving((s) => ({ ...s, [field]: true }));
		try {
			await axios.delete(
				`${API}/api/equip-comments/by-echeck/${echeck._id}`,
				{
					params: { field },
					...tokenHeader(),
				},
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
		<div className="check-page">
			{uiLocked && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 9999,
						background: "rgba(0,0,0,0.55)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 24,
						textAlign: "center",
					}}
				>
					<div style={{ maxWidth: 520 }}>
						<div
							style={{
								fontSize: 18,
								fontWeight: 700,
								marginBottom: 10,
							}}
						>
							Transcribing…
						</div>
						<div style={{ opacity: 0.95 }}>
							Please stay on this page. You’ll be redirected
							automatically when transcription finishes.
						</div>
					</div>
				</div>
			)}

			<div className="check-return-row">
				<Link
					className="return-daylist-button"
					to={monthId ? `/months/${monthId}` : `/`}
				>
					Return to DayList
				</Link>
			</div>

			<div
				className={`check-page-grid ${
					equipAllowed ? "has-equipment" : "no-equipment"
				}`}
			>
				<div className="check-panel check-panel--sound">
					<div className="check-section-heading check-section-heading--with-count">
						<h2>Sound Checks</h2>
						<span className="check-count">
							({checkedCount} / 10 complete)
						</span>
					</div>

					{msg && (
						<p style={{ color: "crimson", marginTop: 8 }}>{msg}</p>
					)}

					{dayLockedForViewer && (
						<p style={{ color: "#555", marginTop: 8 }}>
							This day is currently locked by your teacher. You
							cannot edit checks, comments, equipment, or
							recordings.
						</p>
					)}

					<div className="check-action-row check-action-row--sound">
						<button
							onClick={() => setAll(true)}
							disabled={bulkSaving || dayLockedForViewer}
						>
							Mark all
						</button>
						<button
							onClick={() => setAll(false)}
							disabled={bulkSaving || dayLockedForViewer}
						>
							Clear all
						</button>

						{isAdmin && (
							<button
								type="button"
								onClick={() => toggleDayLock(!dayLocked)}
								disabled={lockSaving}
							>
								{dayLocked
									? "Unlock day for non-admin users"
									: "Lock day for non-admin users"}
							</button>
						)}
					</div>

					<table className="table check-table">
						<thead>
							<tr>
								<th style={{ width: 110 }}>Image</th>
								<th style={{ width: 180 }}>Sound</th>
								<th style={{ width: 120 }}>Binaural</th>
								<th>Comments</th>
							</tr>
						</thead>
						<tbody>
							{FIELD_MAP.map(([field, label]) => (
								<tr key={field}>
									<td>
										<div className="sound-img-wrap">
											{SOUND_IMAGE_MAP[field] ? (
												<img
													className="sound-img"
													src={SOUND_IMAGE_MAP[field]}
													alt={label}
													loading="lazy"
												/>
											) : (
												<div
													className="sound-img sound-img--placeholder"
													aria-hidden="true"
												/>
											)}
										</div>
									</td>
									<td>{label}</td>
									<td>
										<label
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: 8,
											}}
										>
											<input
												type="checkbox"
												checked={!!check[field]}
												onChange={() =>
													toggleField(field)
												}
												disabled={
													bulkSaving ||
													dayLockedForViewer
												}
												aria-label={`Toggle ${label}`}
											/>
											<span>
												{check[field]
													? "True"
													: "False"}
											</span>
										</label>
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
												className="toggle-comment"
												type="button"
												onClick={() =>
													setCommentOpen((o) => ({
														...o,
														[field]: !o[field],
													}))
												}
												aria-label={
													commentOpen[field]
														? `Hide comment for ${label}`
														: `Show comment for ${label}`
												}
											>
												{commentOpen[field] ? "−" : "+"}
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
															commentText[
																field
															] || ""
														}
														onChange={(e) =>
															setCommentText(
																(t) => ({
																	...t,
																	[field]:
																		e.target
																			.value,
																}),
															)
														}
														disabled={
															dayLockedForViewer
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
																saveComment(
																	field,
																)
															}
															disabled={
																commentSaving[
																	field
																] ||
																dayLockedForViewer
															}
															type="button"
														>
															Save
														</button>
														{commentDoc[field] && (
															<button
																onClick={() =>
																	deleteComment(
																		field,
																	)
																}
																disabled={
																	commentSaving[
																		field
																	] ||
																	dayLockedForViewer
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
				</div>

				<div className="check-panel check-panel--recordings">
					{!resolvedUserId && (
						<p className="check-loading-note">
							Loading recordings…
						</p>
					)}

					{resolvedUserId && (
						<RecordingPage
							dayId={dayId}
							userId={resolvedUserId}
							monthId={monthId}
							onTranscribingChange={setUiLocked}
							dayLockedForViewer={dayLockedForViewer}
							isAdmin={isAdmin}
						/>
					)}
				</div>

				{equipAllowed && (
					<aside className="check-panel check-panel--equipment">
						<h3>Equipment Check</h3>
						{equipMsg && (
							<p style={{ color: "crimson" }}>{equipMsg}</p>
						)}
						{!echeck ? (
							<p style={{ opacity: 0.7, fontSize: 14 }}>
								Loading equipment check...
							</p>
						) : (
							<>
								<table className="table check-table">
									<thead>
										<tr>
											<th>Field</th>
											<th style={{ width: 130 }}>
												Status
											</th>
											<th>Comment</th>
										</tr>
									</thead>
									<tbody>
										{EQUIP_FIELDS.map(([field, label]) => (
											<tr key={field}>
												<td>{label}</td>
												<td>
													<label
														style={{
															display:
																"inline-flex",
															alignItems:
																"center",
															gap: 8,
														}}
													>
														<input
															type="checkbox"
															checked={
																!!echeck[field]
															}
															onChange={() =>
																toggleEquip(
																	field,
																)
															}
															disabled={
																equipSaving[
																	field
																] ||
																dayLockedForViewer
															}
															aria-label={`Toggle ${label}`}
														/>
														<span>
															{echeck[field]
																? "True"
																: "False"}
														</span>
													</label>
												</td>
												<td>
													<div
														style={{
															display: "flex",
															alignItems:
																"center",
															gap: 8,
															flexWrap: "wrap",
														}}
													>
														<button
															className="toggle-comment"
															type="button"
															onClick={() =>
																setECmtOpen(
																	(o) => ({
																		...o,
																		[field]:
																			!o[
																				field
																			],
																	}),
																)
															}
															aria-label={
																eCmtOpen[field]
																	? `Hide comment for ${label}`
																	: `Show comment for ${label}`
															}
														>
															{eCmtOpen[field]
																? "−"
																: "+"}
														</button>

														{eCmtOpen[field] && (
															<div
																style={{
																	display:
																		"grid",
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
																	onChange={(
																		e,
																	) =>
																		setECmtText(
																			(
																				t,
																			) => ({
																				...t,
																				[field]:
																					e
																						.target
																						.value,
																			}),
																		)
																	}
																	disabled={
																		dayLockedForViewer
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
																				field,
																			)
																		}
																		disabled={
																			eCmtSaving[
																				field
																			] ||
																			dayLockedForViewer
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
																					field,
																				)
																			}
																			disabled={
																				eCmtSaving[
																					field
																				] ||
																				dayLockedForViewer
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
		</div>
	);
}
