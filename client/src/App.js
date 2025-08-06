import React, { useState, useEffect } from "react";
import Register from "./components/Register";
import Login from "./components/Login";
import Student from "./components/Student";
import axios from "axios";
import setAuthToken from "./utils/setAuthToken";
import UserDashboard from "./components/UserDashboard";
import AdminDashboard from "./components/AdminDashboard";

const App = () => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true); // ✅ new state

	useEffect(() => {
		const token = localStorage.getItem("token");

		if (token) {
			setAuthToken(token);

			axios
				.get("https://mern-deploy-i7u8.onrender.com/api/auth/me")
				.then((res) => {
					setUser(res.data);
					setLoading(false); // ✅ Done loading
				})
				.then((res) => {
					console.log("Auth/me response:", res.data);
					setUser(res.data);
					setLoading(false);
				})
				.catch((err) => {
					console.error("Auth failed:", err.message);
					setUser(null);
					setLoading(false); // ✅ Still done loading
				});
		} else {
			setLoading(false); // ✅ Done loading, no token
		}
	}, []);

	const handleLogout = () => {
		localStorage.removeItem("token"); // Remove token from localStorage
		setUser(null); // Set logged-in user to null
	};

	console.log("User:", user);

	if (loading) {
		return <div className="loading-spinner">Loading...</div>;
	}

	return (
		<div className="App">
			{user ? (
				<div>
					<button onClick={handleLogout}>Logout</button>

					{/* ✅ Correct Conditional Rendering */}
					{user.username === "admin" ? (
						<div>
							<p>Welcome, Professor</p>
							<AdminDashboard user={user} />
						</div>
					) : (
						<div>
							<p>Welcome, {user?.username}</p>
							<UserDashboard userId={user._id} user={user}>
								<MonthList user={user} />
							</UserDashboard>
						</div>
					)}
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
