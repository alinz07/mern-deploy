// backend/models/Equipment.js  (DROP-IN)
const mongoose = require("mongoose");

const EquipmentSchema = new mongoose.Schema(
	{
		// Owner tenant (admin)
		adminUser: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "AdminUser",
			required: true,
			index: true,
		},

		part: {
			type: String,
			required: true,
			trim: true,
			maxlength: 120,
			index: true,
		},
		quantity: { type: Number, default: 1, min: 0 },
		checkbox: { type: Boolean, default: false },
		notes: { type: String, trim: true, maxlength: 2000 },
	},
	{ timestamps: true }
);

// Helpful uniqueness & fast lookups for an admin's catalog
EquipmentSchema.index({ adminUser: 1, part: 1 });

module.exports = mongoose.model("Equipment", EquipmentSchema);
