// client/src/pages/UserEquipmentPage.js
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com";

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

	if (loading) {
		return <p className="equipment-page-loading">Loading your equipment…</p>;
	}

	return (
		<div className="user-equipment-page-shell">
			<div className="equipment-page">
				<div className="equipment-page-panel">
					<header className="equipment-page-header">
						<h1>My Equipment</h1>
						{!creating && (
							<button
								type="button"
								className="equipment-add-button"
								onClick={startCreate}
							>
								Add item
							</button>
						)}
					</header>

					{creating && (
						<section
							className="equipment-create-form"
							aria-labelledby="add-user-equipment-title"
						>
							<h2 id="add-user-equipment-title">Add Equipment Item</h2>
							<div className="equipment-form-grid">
								<label>
									<span>Part</span>
									<input
										type="text"
										value={newForm.part}
										onChange={(e) =>
											setNewForm((f) => ({
												...f,
												part: e.target.value,
											}))
										}
									/>
								</label>
								<label>
									<span>Quantity</span>
									<input
										type="number"
										min={0}
										value={newForm.quantity}
										onChange={(e) =>
											setNewForm((f) => ({
												...f,
												quantity: Number(e.target.value),
											}))
										}
									/>
								</label>
								<label className="equipment-checkbox-field">
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
									<span>Checkbox</span>
								</label>
								<label className="equipment-notes-field">
									<span>Notes</span>
									<input
										type="text"
										value={newForm.notes}
										onChange={(e) =>
											setNewForm((f) => ({
												...f,
												notes: e.target.value,
											}))
										}
									/>
								</label>
							</div>
							<div className="equipment-form-actions">
								<button type="button" onClick={createItem}>
									Save Item
								</button>
								<button
									type="button"
									className="equipment-cancel-button"
									onClick={cancelCreate}
								>
									Cancel
								</button>
							</div>
						</section>
					)}

					<div className="equipment-table-wrap">
						<table className="equipment-table">
							<thead>
								<tr>
									<th>Part</th>
									<th>Qty</th>
									<th>Checkbox</th>
									<th>Notes</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{sorted.length === 0 ? (
									<tr>
										<td colSpan={5} className="equipment-table-empty">
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
												<td className="equipment-table-center">
													{editing ? (
														<input
															type="number"
															min={0}
															value={editForm.quantity}
															onChange={(e) =>
																setEditForm((f) => ({
																	...f,
																	quantity: Number(e.target.value),
																}))
															}
														/>
													) : (
														row.quantity ?? 0
													)}
												</td>
												<td className="equipment-table-center">
													<input
														type="checkbox"
														checked={
															editing
																? !!editForm.checkbox
																: !!row.checkbox
														}
														readOnly={!editing}
														onChange={(e) =>
															setEditForm((f) => ({
																...f,
																checkbox: e.target.checked,
															}))
														}
													/>
												</td>
												<td>
													{editing ? (
														<input
															type="text"
															value={editForm.notes}
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
												<td className="equipment-row-actions">
													{editing ? (
														<>
															<button type="button" onClick={saveEdit}>
																Save
															</button>
															<button
																type="button"
																className="equipment-cancel-button"
																onClick={cancelEdit}
															>
																Cancel
															</button>
														</>
													) : (
														<>
															<button type="button" onClick={() => startEdit(row)}>
																Edit
															</button>
															<button
																type="button"
																className="equipment-delete-button"
																onClick={() => del(row._id)}
																disabled={deletingId === row._id}
															>
																{deletingId === row._id ? "Deleting…" : "Delete"}
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
				</div>
			</div>
		</div>
	);
}
