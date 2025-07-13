// import { useEffect, useState } from "react";
// import TodoItem from "./TodoItem";
// const API_BASE = "https://mern-deploy-i7u8.onrender.com";

// function App() {
// 	const [items, setItems] = useState([]);
// 	const [input, setInput] = useState("");

// 	useEffect(() => {
// 		GetTodos();
// 	}, []);

// 	const handleChange = (e) => {
// 		setInput(e.target.value);
// 	};

// 	const GetTodos = () => {
// 		fetch(API_BASE + "/todo")
// 			.then((res) => res.json())
// 			.then((data) => setItems(data))
// 			.catch((err) => console.log(err));
// 	};

// 	const addItem = async () => {
// 		const data = await fetch(API_BASE + "/new", {
// 			method: "POST",
// 			headers: {
// 				"content-type": "application/json",
// 			},
// 			body: JSON.stringify({
// 				name: input,
// 				completed: false,
// 			}),
// 		}).then((res) => res.json());
// 		console.log(data);
// 		await GetTodos();
// 		setInput("");
// 	};

// 	return (
// 		<div className="container">
// 			<div className="heading">
// 				<h1>TO-DO-APP</h1>
// 			</div>

// 			<div className="form">
// 				<input
// 					type="text"
// 					value={input}
// 					onChange={handleChange}
// 				></input>
// 				<button onClick={() => addItem()}>
// 					<span>ADD</span>
// 				</button>
// 			</div>

// 			<div className="todolist">
// 				{items.map((item) => {
// 					const { _id, name, completed } = item;
// 					return (
// 						<TodoItem
// 							name={name}
// 							id={_id}
// 							completed={completed}
// 							setItems={setItems}
// 						/>
// 					);
// 				})}
// 			</div>
// 		</div>
// 	);
// }

// export default App;
// client/src/App.js
import React, { useState } from "react";
import Register from "./components/Register";
import Login from "./components/Login";
import Student from "./components/Student";

const App = () => {
	const [loggedInUser, setLoggedInUser] = useState(null);

	const handleLogout = () => {
		localStorage.removeItem("token"); // Remove token from localStorage
		setLoggedInUser(null); // Set logged-in user to null
	};

	return (
		<div className="App">
			{loggedInUser ? (
				<div>
					<p>Welcome {loggedInUser}</p>
					<button onClick={handleLogout}>Logout</button>
					<Student />
				</div>
			) : (
				<div>
					<Register />
					<Login setLoggedInUser={setLoggedInUser} />
				</div>
			)}
		</div>
	);
};

export default App;
