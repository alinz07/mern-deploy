// backend/utils/isAdmin.js
module.exports = (req) => (req.user?.username || "").toLowerCase() === "admin";
