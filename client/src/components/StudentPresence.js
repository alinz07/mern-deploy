import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "https://mern-deploy-docker.onrender.com";

const tokenHeader = () => ({
	headers: { "x-auth-token": localStorage.getItem("token") },
});

export async function fetchStudentPresence(userId) {
	const response = await axios.get(
		`${API}/api/users/${userId}/presence`,
		tokenHeader(),
	);
	return response.data;
}

export default function StudentPresence({ userId }) {
	const [presence, setPresence] = useState(null);

	useEffect(() => {
		let active = true;
		if (!userId) return undefined;

		fetchStudentPresence(userId)
			.then((data) => {
				if (active) setPresence(data);
			})
			.catch(() => {
				if (active) setPresence({ isOnline: false });
			});

		return () => {
			active = false;
		};
	}, [userId]);

	if (!userId) return null;

	const isOnline = presence?.isOnline === true;
	const label = isOnline ? "Currently active" : "Not currently active";
	return (
		<span className="student-presence" title={label} aria-label={label}>
			<span
				className={`student-presence__dot ${
					isOnline
						? "student-presence__dot--online"
						: "student-presence__dot--away"
				}`}
				aria-hidden="true"
			/>
			<span className="student-presence__label">{label}</span>
		</span>
	);
}
