// client/src/components/StudentList.js
import React, { useEffect, useState } from "react";
import axios from "axios";
import "./style.css"; // Import CSS for styling

const Student = () => {
	const [students, setStudents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");

	const [formData, setFormData] = useState({
		studentname: "",
	});

	const { studentname } = formData;

	useEffect(() => {
		const fetchStudents = async () => {
			try {
				const res = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/students"
				);
				setStudents(res.data);
				setLoading(false);
			} catch (err) {
				console.error("Failed to fetch students:", err.message);
				setError("Failed to load students");
				setLoading(false);
			}
		};

		fetchStudents();
	}, []);

	const onChange = (e) =>
		setFormData({ ...formData, [e.target.name]: e.target.value });

	const onSubmit = async (e) => {
		e.preventDefault();
		try {
			const res = await axios.post(
				"https://mern-deploy-i7u8.onrender.com/api/students/new",
				{
					studentname,
				}
			);

			// Set success message
			setMessage("Student added successfully");
		} catch (err) {
			console.error(err.response.data);
			// Set error message
			setMessage("Add Student Failed");
		}
	};

	if (loading) return <p>Loading students...</p>;
	if (error) return <p className="error">{error}</p>;

	return (
		<div>
			<div className="student-list">
				<h2>Student List</h2>
				<table>
					<thead>
						<tr>
							<th>Name</th>
						</tr>
					</thead>
					<tbody>
						{students.map((student) => (
							<tr key={student._id}>
								<td>{student.studentname}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="add-student-form">
				<h2>New Student Name</h2>
				<form onSubmit={onSubmit}>
					<input
						type="text"
						placeholder="Student Name"
						name="studentname"
						value={studentname}
						onChange={onChange}
						required
					/>
					<button type="submit">Add Student</button>
				</form>
				<p className="message">{message}</p>
			</div>
		</div>
	);
};

export default Student;
