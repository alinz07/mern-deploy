module.exports = {
	mongoURI: process.env.MONGODB_URI,
	jwtSecret: "hello",
	adminCreateCode: (process.env.ADMIN_CREATE_CODE || "42069").trim(),
};
