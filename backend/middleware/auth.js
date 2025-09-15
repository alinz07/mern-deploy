// server/middleware/auth.js
const jwt = require("jsonwebtoken");
const config = require("../config");

function auth(req, res, next) {
	const token = req.header("x-auth-token");
	if (!token) {
		return res.status(401).json({ msg: "No token, authorization denied" });
	}

	try {
		const decoded = jwt.verify(token, config.jwtSecret);
		req.user = decoded.user; // { id, username }
		next();
	} catch (err) {
		return res.status(401).json({ msg: "Token is not valid" });
	}
}

module.exports = auth;
