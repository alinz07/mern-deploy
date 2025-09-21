// client/src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import setAuthToken from "./utils/setAuthToken";
import { BrowserRouter } from "react-router-dom";

// Rehydrate token BEFORE the app renders so the first request has the header
const token = localStorage.getItem("token");
if (token) setAuthToken(token);

const root = createRoot(document.getElementById("root"));
root.render(
	<React.StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</React.StrictMode>
);
