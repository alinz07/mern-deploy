// client/src/components/Register.js
import React, { useState } from "react";
import axios from "axios";
import "./style.css"; // Import CSS for styling

const Register = () => {
	const [formData, setFormData] = useState({
		username: "",
		password: "",
		email: "",
	});
	const [message, setMessage] = useState("");

	const { username, password, email } = formData;

	const onChange = (e) =>
		setFormData({ ...formData, [e.target.name]: e.target.value });

	const onSubmit = async (e) => {
		e.preventDefault();
		try {
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/auth/register",
				{
					username,
					password,
					email,
				}
			);
			setMessage("Registered successfully"); // Set success message
			console.log("are these appearing?");
		} catch (err) {
			console.error(err.response.data);
			setMessage("Failed to register, User already exists"); // Set error message
		}
	};

	return (
		<div className="auth-form">
			<h2>Register</h2>
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
				<input
					type="email"
					placeholder="Email"
					name="email"
					value={email}
					onChange={onChange}
				/>
				<button type="submit">Register</button>
			</form>
			<p className="message">{message}</p>
		</div>
	);
};

export default Register;
