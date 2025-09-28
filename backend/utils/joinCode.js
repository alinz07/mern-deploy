// backend/utils/joinCode.js
exports.generateJoinCode = () =>
	Math.random().toString(36).slice(2, 8).toUpperCase(); // e.g. "K3MD91"
