import React, { useState, useEffect } from "react";
import Register from "./components/Register";
import Login from "./components/Login";
import Student from "./components/Student";
import axios from "axios";
import setAuthToken from "./utils/setAuthToken";

const App = () => {
	const [user, setUser] = useState(null);

	useEffect(() => {
		// On app load, set the token for axios if it exists
		const token = localStorage.getItem("token");
		if (token) {
			setAuthToken(token);

			// Fetch current user using token
			axios
				.get("https://mern-deploy-i7u8.onrender.com/api/auth/me")
				.then((res) => {
					setUser(res.data); // 👈 store user info
				})
				.catch((err) => {
					console.error("Auth failed", err.message);
					setUser(null);
				});
		}
	}, []);

	const handleLogout = () => {
		localStorage.removeItem("token"); // Remove token from localStorage
		setUser(null); // Set logged-in user to null
	};

	console.log("User:", user);

	return (
		<div className="App">
			{user ? (
				<div>
					<p>Welcome, {user?.username}</p>
					<button onClick={handleLogout}>Logout</button>
					<Student />
				</div>
			) : (
				<div>
					<Register />
					<Login setUser={setUser} />
				</div>
			)}
		</div>
	);
};

export default App;
