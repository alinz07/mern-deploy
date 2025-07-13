import React, { useState } from "react";

const Student = () => {
	// const [formData, setFormData] = useState({
	// 	username: "",
	// 	password: "",
	// });
	// const [message, setMessage] = useState("");

	// const { username, password } = formData;

	// const onChange = (e) =>
	// 	setFormData({ ...formData, [e.target.name]: e.target.value });

	// const onSubmit = async (e) => {
	// 	e.preventDefault();
	// 	try {
	// 		const res = await axios.post(
	// 			"https://mern-deploy-1-hixt.onrender.com/api/auth/register",
	// 			{
	// 				username,
	// 				password,
	// 			}
	// 		);
	// 		setMessage("Registered successfully"); // Set success message
	// 	} catch (err) {
	// 		console.error(err.response.data);
	// 		setMessage("Failed to register, User already exists"); // Set error message
	// 	}
	// };

	return (
		<div className="student-list">
			<h2>Students</h2>
		</div>
	);
};

export default Student;
