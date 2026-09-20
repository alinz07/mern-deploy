// client/src/components/UserDashboard.js  (DROP-IN)
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
					"https://mern-deploy-docker.onrender.com/api/admin/contact-email",
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
					`https://mern-deploy-docker.onrender.com/api/users/${userId}/data`,
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

	if (loading) return <p className="user-dashboard-loading">Loading your data...</p>;

	return (
		<main className="user-dashboard">
			<header className="user-dashboard-welcome">
				<h1>Welcome, {user?.username || data.username}</h1>
			</header>

			<div className="user-dashboard-grid">
			<div className="user-main">
				<section className="user-profile-panel">
					<h2>Your Info</h2>
					<dl className="user-profile-details">
						<div>
							<dt>Username</dt>
							<dd>{data.username}</dd>
						</div>
						<div>
							<dt>Email</dt>
							<dd>{data.email}</dd>
						</div>
					</dl>
					<Link
						className="user-equipment-button"
						to="/my-equipment"
						title="Manage your equipment"
					>
						My Equipment
					</Link>
				</section>

				<section className="user-months-panel">
				<MonthList user={user} />
				</section>
			</div>

			<aside className="mail-card">
				<h2>Send a Message</h2>
				<p className="mail-card-intro">
					This will email your admin.
				</p>

				<form
					ref={formRef}
					onSubmit={onSendEmail}
					className="mail-form"
				>
					<input type="hidden" name="to_email" value={adminEmail} />

					<label htmlFor="message-from-name">Your name</label>
					<input
						id="message-from-name"
						type="text"
						name="from_name"
						defaultValue={user?.username || ""}
						placeholder="Your name"
						required
					/>
					<label htmlFor="message-from-email">Your email</label>
					<input
						id="message-from-email"
						type="email"
						name="from_email"
						defaultValue={data?.email || ""}
						placeholder="Your email"
						required
					/>
					<label htmlFor="message-subject">Subject</label>
					<input
						id="message-subject"
						type="text"
						name="subject"
						placeholder="Subject"
						required
					/>
					<label htmlFor="message-body">Message</label>
					<textarea
						id="message-body"
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
		</main>
	);
}

export default UserDashboard;
