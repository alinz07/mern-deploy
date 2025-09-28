// client/src/App.js
import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Register from "./components/Register";
import Login from "./components/Login";
import axios from "axios";
import setAuthToken from "./utils/setAuthToken";
import UserDashboard from "./components/UserDashboard";
import AdminDashboard from "./components/AdminDashboard";
import DayList from "./components/DayList";
import CheckPage from "./pages/CheckPage";

const App = () => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	// Rehydrate token & fetch current user on app start
	useEffect(() => {
		const token = localStorage.getItem("token");
		if (!token) {
			setLoading(false);
			return;
		}

		setAuthToken(token);
		axios
			.get("https://mern-deploy-i7u8.onrender.com/api/auth/me")
			.then((res) => setUser(res.data))
			.catch((err) => {
				console.error(
					"Auth failed:",
					err.response?.data || err.message
				);
				localStorage.removeItem("token");
				setAuthToken(null);
				setUser(null);
			})
			.finally(() => setLoading(false));
	}, []);

	const handleLogout = () => {
		localStorage.removeItem("token");
		setAuthToken(null);
		setUser(null);
	};

	if (loading) {
		return <div className="loading-spinner">Loading...</div>;
	}

	const isAdmin = user?.role === "admin";

	return (
		<div className="App">
			{user ? (
				<div>
					<button onClick={handleLogout}>Logout</button>

					<Routes>
						<Route
							path="/"
							element={
								isAdmin ? (
									<div>
										<p>Welcome, {user.username}</p>
										<AdminDashboard user={user} />
									</div>
								) : (
									<div>
										<p>Welcome, {user.username}</p>
										<UserDashboard
											userId={user._id}
											user={user}
										/>
									</div>
								)
							}
						/>
						<Route path="/months/:monthId" element={<DayList />} />
						<Route
							path="/days/:dayId/check"
							element={<CheckPage />}
						/>
					</Routes>
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
