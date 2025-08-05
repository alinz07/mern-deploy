// client/src/components/Login.js
import React, { useState } from "react";
import axios from "axios";
import "./style.css"; // Import CSS for styling
import setAuthToken from "../utils/setAuthToken";

const Login = ({ setUser }) => {
	const [formData, setFormData] = useState({
		username: "",
		password: "",
	});
	const [message, setMessage] = useState("");

	const { username, password } = formData;

	const onChange = (e) =>
		setFormData({ ...formData, [e.target.name]: e.target.value });

	const onSubmit = async (e) => {
		e.preventDefault();
		try {
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/auth/login",
				{ username, password }
			);

			if (res.data.token) {
				// 1. Save token
				localStorage.setItem("token", res.data.token);
				setAuthToken(res.data.token);

				// 2. Fetch real user info
				const userRes = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/auth/me"
				);
				setUser(userRes.data); // 👈 Use real user object

				setMessage("Logged in successfully");
			} else {
				console.error("No token in response:", res.data);
				setMessage("Login failed - no token received");
			}
		} catch (err) {
			console.error(err.response?.data || err.message);
			setMessage("Failed to login - wrong credentials");
		}
	};

	return (
		<div className="auth-form">
			<h2>Login</h2>
			<form onSubmit={onSubmit}>
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
				<button type="submit">Login</button>
			</form>
			<p className="message">{message}</p>
		</div>
	);
};

export default Login;
