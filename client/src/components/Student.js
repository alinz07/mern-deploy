// client/src/components/StudentList.js
import React, { useEffect, useState } from "react";
import axios from "axios";

const Student = () => {
	const [students, setStudents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

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

	if (loading) return <p>Loading students...</p>;
	if (error) return <p className="error">{error}</p>;

	return (
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
	);
};

export default Student;
