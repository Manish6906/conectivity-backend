const mongoose = require("mongoose");

const DEFAULT_PIC = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    gender: { type: String, enum: ["male", "female", "other"], required: true },
    password: { type: String, required: true, minlength: 6, select: false },

    profilePic: { type: String, default: DEFAULT_PIC },
    bio: { type: String, default: "" },
    education: { type: String, default: "" },

    emailVerified: { type: Boolean, default: false },
    otpCode: { type: String, default: "" },
    otpExpiresAt: { type: Date, default: null },
    loginOtpCode: { type: String, default: "" },
    loginOtpExpiresAt: { type: Date, default: null },

    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },

    settings: {
      readReceipts: { type: Boolean, default: true },
      showLastSeen: { type: Boolean, default: true },
    },
    privacy: {
      showPhone: { type: Boolean, default: false },
      showEmail: { type: Boolean, default: false },
    },
    isDeactivated: { type: Boolean, default: false },
    deactivatedAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: Date.now },
    blocked: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);