// client/src/components/Register.js
import React, { useState } from "react";
import axios from "axios";
import "./style.css";

const Register = () => {
	const [formData, setFormData] = useState({
		username: "",
		password: "",
		email: "",
		newAdmin: false,
		adminName: "",
		adminJoinCode: "",
	});
	const [message, setMessage] = useState("");
	const [joinCode, setJoinCode] = useState("");

	const { username, password, email, newAdmin, adminName, adminJoinCode } =
		formData;

	const onChange = (e) =>
		setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

	const onToggleAdmin = (e) => {
		const checked = e.target.checked;
		setFormData((prev) => ({
			...prev,
			newAdmin: checked,
			// clear the opposite side when toggling
			adminName: checked ? prev.adminName : "",
			adminJoinCode: checked ? "" : prev.adminJoinCode,
		}));
		setJoinCode("");
		setMessage("");
	};

	const onSubmit = async (e) => {
		e.preventDefault();
		setMessage("");
		setJoinCode("");
		if (!email.trim()) {
			setMessage("Email is required.");
			return;
		}
		try {
			const payload = newAdmin
				? {
						newAdmin: true,
						adminName: adminName.trim(),
						username: username.trim(),
						password,
						email: email.trim(),
						adminCode, // <— send the UI-entered code to the server
				  }
				: {
						adminJoinCode: adminJoinCode.trim(),
						username: username.trim(),
						password,
						email: email.trim(),
				  };

			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/auth/register",
				payload
			);

			// For admins, backend returns { token, joinCode }; for users, { token }
			if (res.data?.joinCode) setJoinCode(res.data.joinCode);
			setMessage("Registered successfully. Please log in.");

			// Optional: you could auto-login here using res.data.token,
			// but we’ll keep it simple and let the user log in via the Login form.
		} catch (err) {
			const apiMsg =
				err?.response?.data?.msg ||
				err?.response?.data?.error ||
				"Registration failed";
			console.error(
				"Register error:",
				err?.response?.data || err?.message
			);
			setMessage(apiMsg);
		}
	};

	return (
		<div className="auth-form">
			<h2>Register</h2>

			<form onSubmit={onSubmit}>
				<label
					style={{
						display: "flex",
						gap: 8,
						alignItems: "center",
						marginBottom: 8,
					}}
				>
					<input
						type="checkbox"
						name="newAdmin"
						checked={newAdmin}
						onChange={onToggleAdmin}
					/>
					<span>Create admin</span>
				</label>

				{newAdmin ? (
					<>
						<input
							type="text"
							placeholder="Organization / Admin name"
							name="adminName"
							value={adminName}
							onChange={onChange}
							required
						/>
					</>
				) : (
					<>
						<input
							type="text"
							placeholder="Join code from your admin"
							name="adminJoinCode"
							value={adminJoinCode}
							onChange={onChange}
							required
						/>
					</>
				)}

				<input
					type="text"
					placeholder="Username"
					name="username"
					value={username}
					onChange={onChange}
					required
				/>
				<input
					type="password"
					placeholder="Password"
					name="password"
					value={password}
					onChange={onChange}
					required
				/>
				<input
					type="email"
					placeholder="Email"
					name="email"
					value={email}
					onChange={onChange}
				/>

				<button type="submit">Register</button>
			</form>

			{!!joinCode && (
				<p className="message">
					<strong>Your admin join code:</strong> {joinCode}
				</p>
			)}
			<p className="message">{message}</p>
		</div>
	);
};

export default Register;
