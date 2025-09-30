// backend/utils/isAdmin.js
//this isn't currently being used. there is a check in App.js client side for user?.role==="admin" and months.js backend
//so if I need to start using the check more, then I need to maybe use this utility.
module.exports = (req) => (req.user?.username || "").toLowerCase() === "admin";
