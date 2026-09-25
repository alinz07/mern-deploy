const bcrypt = require("bcryptjs");
const User = require("../models/User");

const guestConfig = () => ({
	adminUsername: process.env.GUEST_ADMIN_USERNAME || "guest-admin",
	adminEmail: process.env.GUEST_ADMIN_EMAIL || "guest-admin@example.com",
	adminName: process.env.GUEST_ADMIN_NAME || "Guest Classroom",
	adminPassword: process.env.GUEST_ADMIN_PASSWORD,
	studentPassword: process.env.GUEST_STUDENT_PASSWORD,
	students: [
		{ username: "demo-ava", email: "demo-ava@example.com" },
		{ username: "demo-milo", email: "demo-milo@example.com" },
		{ username: "demo-sofia", email: "demo-sofia@example.com" },
	],
});

const requireGuestPasswords = (config) => {
	if (!config.adminPassword || !config.studentPassword) {
		throw new Error(
			"Set GUEST_ADMIN_PASSWORD and GUEST_STUDENT_PASSWORD before running this script.",
		);
	}
};

const createDemoStudents = async (adminUserId, students, password) => {
	const passwordHash = await bcrypt.hash(password, 10);
	const created = [];

	for (const student of students) {
		const collision = await User.findOne({
			$or: [{ username: student.username }, { email: student.email }],
		});
		if (collision) {
			if (String(collision.adminUser) !== String(adminUserId)) {
				throw new Error(
					`Demo identity ${student.username} is already used outside the guest tenant.`,
				);
			}
			collision.username = student.username;
			collision.email = student.email;
			collision.password = passwordHash;
			collision.role = "user";
			await collision.save();
			created.push(collision);
			continue;
		}

		created.push(
			await User.create({
				...student,
				password: passwordHash,
				role: "user",
				adminUser: adminUserId,
			}),
		);
	}

	return created;
};

module.exports = { guestConfig, requireGuestPasswords, createDemoStudents };
