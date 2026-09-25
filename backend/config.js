module.exports = {
	mongoURI: process.env.MONGODB_URI,
	jwtSecret: (process.env.JWT_SECRET || "hello").trim(),
	adminCreateCode: (process.env.ADMIN_CREATE_CODE || "42069").trim(),
};
