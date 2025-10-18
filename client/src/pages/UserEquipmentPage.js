// client/src/pages/UserEquipmentPage.js
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API = "https://mern-deploy-i7u8.onrender.com";

export default function UserEquipmentPage() {
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const [newForm, setNewForm] = useState({
		part: "",
		quantity: 1,
		checkbox: false,
		notes: "",
	});
	const [editId, setEditId] = useState(null);
	const [editForm, setEditForm] = useState({
		part: "",
		quantity: 1,
		checkbox: false,
		notes: "",
	});
	const [deletingId, setDeletingId] = useState(null);
	const tokenHeader = () => ({
		headers: { "x-auth-token": localStorage.getItem("token") },
	});

	const sorted = useMemo(
		() =>
			[...rows].sort((a, b) =>
				(a.part || "").localeCompare(b.part || "")
			),
		[rows]
	);

	useEffect(() => {
		const run = async () => {
			try {
				const res = await axios.get(
					`${API}/api/user-equipment`,
					tokenHeader()
				);
				setRows(res.data || []);
			} finally {
				setLoading(false);
			}
		};
		run();
	}, []);

	const startCreate = () => {
		setCreating(true);
		setNewForm({ part: "", quantity: 1, checkbox: false, notes: "" });
	};
	const cancelCreate = () => {
		setCreating(false);
		setNewForm({ part: "", quantity: 1, checkbox: false, notes: "" });
	};
	const createItem = async () => {
		const payload = {
			part: (newForm.part || "").trim(),
			quantity: Number(newForm.quantity) || 0,
			checkbox: !!newForm.checkbox,
			notes: newForm.notes || "",
		};
		if (!payload.part) return alert("Part is required.");
		try {
			const res = await axios.post(
				`${API}/api/user-equipment`,
				payload,
				tokenHeader()
			);
			setRows((r) => [res.data, ...r]);
			cancelCreate();
		} catch (e) {
			alert(e?.response?.data?.msg || "Create failed");
		}
	};

	const startEdit = (row) => {
		setEditId(row._id);
		setEditForm({
			part: row.part || "",
			quantity: row.quantity ?? 1,
			checkbox: !!row.checkbox,
			notes: row.notes || "",
		});
	};
	const cancelEdit = () => {
		setEditId(null);
		setEditForm({ part: "", quantity: 1, checkbox: false, notes: "" });
	};
	const saveEdit = async () => {
		try {
			const res = await axios.patch(
				`${API}/api/user-equipment/${editId}`,
				editForm,
				tokenHeader()
			);
			setRows((r) => r.map((x) => (x._id === editId ? res.data : x)));
			cancelEdit();
		} catch (e) {
			alert(e?.response?.data?.msg || "Update failed");
		}
	};

	const del = async (id) => {
		if (!window.confirm("Delete this equipment item?")) return;
		setDeletingId(id);
		try {
			await axios.delete(
				`${API}/api/user-equipment/${id}`,
				tokenHeader()
			);
			setRows((r) => r.filter((x) => x._id !== id));
		} catch (e) {
			alert(e?.response?.data?.msg || "Delete failed");
		} finally {
			setDeletingId(null);
		}
	};

	if (loading) return <p>Loading your equipment…</p>;

	return (
		<div>
			<p style={{ marginBottom: 12 }}>
				<Link to="/">← Back to Dashboard</Link>
			</p>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
				}}
			>
				<h2 style={{ margin: 0 }}>My Equipment</h2>
				{!creating ? (
					<button type="button" onClick={startCreate}>
						Add item
					</button>
				) : (
					<div
						style={{
							display: "flex",
							gap: 8,
							alignItems: "center",
							flexWrap: "wrap",
						}}
					>
						<input
							type="text"
							placeholder="Part"
							value={newForm.part}
							onChange={(e) =>
								setNewForm((f) => ({
									...f,
									part: e.target.value,
								}))
							}
						/>
						<input
							type="number"
							min={0}
							value={newForm.quantity}
							style={{ width: 90 }}
							onChange={(e) =>
								setNewForm((f) => ({
									...f,
									quantity: Number(e.target.value),
								}))
							}
						/>
						<label
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							<input
								type="checkbox"
								checked={!!newForm.checkbox}
								onChange={(e) =>
									setNewForm((f) => ({
										...f,
										checkbox: e.target.checked,
									}))
								}
							/>
							checkbox
						</label>
						<input
							type="text"
							placeholder="Notes"
							value={newForm.notes}
							style={{ width: 280 }}
							onChange={(e) =>
								setNewForm((f) => ({
									...f,
									notes: e.target.value,
								}))
							}
						/>
						<button type="button" onClick={createItem}>
							Save
						</button>
						<button type="button" onClick={cancelCreate}>
							Cancel
						</button>
					</div>
				)}
			</div>

			<table style={{ marginTop: 12, width: "100%", maxWidth: 900 }}>
				<thead>
					<tr>
						<th style={{ textAlign: "left" }}>Part</th>
						<th>Qty</th>
						<th>Checkbox</th>
						<th style={{ textAlign: "left" }}>Notes</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{sorted.length === 0 ? (
						<tr>
							<td
								colSpan={5}
								style={{ opacity: 0.7, fontStyle: "italic" }}
							>
								No equipment yet.
							</td>
						</tr>
					) : (
						sorted.map((row) => {
							const editing = editId === row._id;
							return (
								<tr key={row._id}>
									<td>
										{editing ? (
											<input
												type="text"
												value={editForm.part}
												onChange={(e) =>
													setEditForm((f) => ({
														...f,
														part: e.target.value,
													}))
												}
											/>
										) : (
											row.part
										)}
									</td>
									<td style={{ textAlign: "center" }}>
										{editing ? (
											<input
												type="number"
												min={0}
												value={editForm.quantity}
												style={{ width: 80 }}
												onChange={(e) =>
													setEditForm((f) => ({
														...f,
														quantity: Number(
															e.target.value
														),
													}))
												}
											/>
										) : (
											row.quantity ?? 0
										)}
									</td>
									<td style={{ textAlign: "center" }}>
										{editing ? (
											<input
												type="checkbox"
												checked={!!editForm.checkbox}
												onChange={(e) =>
													setEditForm((f) => ({
														...f,
														checkbox:
															e.target.checked,
													}))
												}
											/>
										) : (
											<input
												type="checkbox"
												checked={!!row.checkbox}
												readOnly
											/>
										)}
									</td>
									<td>
										{editing ? (
											<input
												type="text"
												value={editForm.notes}
												style={{ width: "100%" }}
												onChange={(e) =>
													setEditForm((f) => ({
														...f,
														notes: e.target.value,
													}))
												}
											/>
										) : (
											row.notes || ""
										)}
									</td>
									<td style={{ whiteSpace: "nowrap" }}>
										{editing ? (
											<>
												<button
													type="button"
													onClick={saveEdit}
												>
													Save
												</button>
												<button
													type="button"
													onClick={cancelEdit}
												>
													Cancel
												</button>
											</>
										) : (
											<>
												<button
													type="button"
													onClick={() =>
														startEdit(row)
													}
												>
													Edit
												</button>
												<button
													type="button"
													onClick={() => del(row._id)}
													disabled={
														deletingId === row._id
													}
												>
													{deletingId === row._id
														? "Deleting…"
														: "Delete"}
												</button>
											</>
										)}
									</td>
								</tr>
							);
						})
					)}
				</tbody>
			</table>
		</div>
	);
}
