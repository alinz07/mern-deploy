// client/src/components/Login.js
import React, { useState } from "react";
import axios from "axios";
import "./style.css";
import setAuthToken from "../utils/setAuthToken";
import { useNavigate } from "react-router-dom";

const Login = ({ setUser }) => {
	const [formData, setFormData] = useState({ username: "", password: "" });
	const [message, setMessage] = useState("");
	const navigate = useNavigate();

	const { username, password } = formData;

	const onChange = (e) =>
		setFormData({ ...formData, [e.target.name]: e.target.value });

	const onSubmit = async (e) => {
		e.preventDefault();
		setMessage("");
		try {
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/auth/login",
				{ username, password }
			);

			if (res.data?.token) {
				// 1) Persist token and set axios default header
				localStorage.setItem("token", res.data.token);
				setAuthToken(res.data.token);

				// 2) Get the current user
				const me = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/auth/me"
				);

				if (typeof setUser === "function") {
					setUser(me.data);
				}
				setMessage("Logged in successfully");
				navigate("/", { replace: true });
			} else {
				setMessage("Login failed - no token received");
			}
		} catch (err) {
			console.error("Login error:", err.response?.data || err.message);
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
