// client/src/components/UserDashboard.js  (DROP-IN)
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import emailjs from "@emailjs/browser";
import MonthList from "./MonthList";

function UserDashboard({ userId, user }) {
	const [data, setData] = useState([]);
	const [loading, setLoading] = useState(true);

	// EmailJS form state
	const formRef = useRef(null);
	const [sending, setSending] = useState(false);
	const [status, setStatus] = useState({ type: "", msg: "" });
	const [adminEmail, setAdminEmail] = useState("");

	useEffect(() => {
		const run = async () => {
			try {
				const token = localStorage.getItem("token");
				const r = await axios.get(
					"https://mern-deploy-i7u8.onrender.com/api/admin/contact-email",
					{ headers: { "x-auth-token": token } }
				);
				setAdminEmail(r.data?.toEmail || "");
			} catch (e) {
				console.error(
					"Failed to load admin contact email",
					e?.response?.data || e.message
				);
			}
		};
		run();
	}, []);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const token = localStorage.getItem("token");
				const res = await axios.get(
					`https://mern-deploy-i7u8.onrender.com/api/users/${userId}/data`,
					{ headers: { "x-auth-token": token } }
				);
				setData(res.data);
			} catch (err) {
				console.error(
					"Failed to load user data:",
					err.response?.data || err.message
				);
			} finally {
				setLoading(false);
			}
		};
		if (userId) fetchData();
	}, [userId]);

	const onSendEmail = async (e) => {
		e.preventDefault();
		setSending(true);
		setStatus({ type: "", msg: "" });

		try {
			const SERVICE_ID = process.env.REACT_APP_EMAILJS_SERVICE_ID;
			const TEMPLATE_ID = process.env.REACT_APP_EMAILJS_TEMPLATE_ID;
			const PUBLIC_KEY = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

			await emailjs.sendForm(
				SERVICE_ID,
				TEMPLATE_ID,
				formRef.current,
				PUBLIC_KEY,
				{
					// optional: additional variables go here
				}
			);

			setStatus({
				type: "ok",
				msg: "Message sent! We'll be in touch soon.",
			});
			formRef.current.reset();
		} catch (err) {
			console.error(err);
			setStatus({
				type: "err",
				msg: "Sorry, your message could not be sent. Please try again.",
			});
		} finally {
			setSending(false);
		}
	};

	if (loading) return <p>Loading your data...</p>;

	return (
		<div className="user-dashboard">
			{/* LEFT: profile + months */}
			<div className="user-main">
				<h3>Your Info</h3>
				<ul>
					<li>Email: {data.email}</li>
					<li>Username: {data.username}</li>
				</ul>
				<p style={{ marginTop: 8 }}>
					<a href="/my-equipment">
						<button type="button" title="Manage your equipment">
							My Equipment
						</button>
					</a>
				</p>
				<div className="sp-16" />
				<MonthList user={user} />
			</div>

			{/* RIGHT: email panel */}
			<aside className="mail-card">
				<h4>Send a message</h4>
				<p className="muted" style={{ marginTop: -6 }}>
					This will email your admin.
				</p>

				<form
					ref={formRef}
					onSubmit={onSendEmail}
					className="mail-form"
				>
					{/* These names should match your EmailJS template variables */}
					<input type="hidden" name="to_email" value={adminEmail} />

					<input
						type="text"
						name="from_name"
						defaultValue={user?.username || ""}
						placeholder="Your name"
						required
					/>
					<input
						type="email"
						name="from_email"
						defaultValue={data?.email || ""}
						placeholder="Your email"
						required
					/>
					<input
						type="text"
						name="subject"
						placeholder="Subject"
						required
					/>
					<textarea
						name="message"
						placeholder="Write your message…"
						rows={7}
						required
					/>
					<button type="submit" disabled={sending}>
						{sending ? "Sending…" : "Send"}
					</button>

					{status.msg && (
						<div
							className={
								status.type === "ok" ? "msg-ok" : "msg-err"
							}
							role="status"
						>
							{status.msg}
						</div>
					)}
				</form>
			</aside>
		</div>
	);
}

export default UserDashboard;
