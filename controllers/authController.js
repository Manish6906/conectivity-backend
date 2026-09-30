const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const makeToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

const INACTIVE_DELETE_MS = 48 * 60 * 60 * 1000;

const makeOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const ensureAccountNotExpired = async (user) => {
  if (!user) return false;
  if (!user.isDeactivated || !user.deactivatedAt) return false;

  const expired = Date.now() - new Date(user.deactivatedAt).getTime() > INACTIVE_DELETE_MS;
  if (!expired) return false;

  await User.deleteOne({ _id: user._id });
  return true;
};

const sendOtpMail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Connectivity" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Account verification OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="margin-bottom: 16px; color: #111827;">Account Verification</h2>
        <p style="margin: 0 0 12px; color: #374151;">Aapke account ko verify karne ke liye ye OTP use karein:</p>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 18px; text-align: center; font-size: 32px; letter-spacing: 8px; color: #065f46; font-weight: 700;">
          ${otp}
        </div>
        <p style="margin-top: 16px; color: #6b7280; font-size: 13px;">Ye OTP 5 minute ke liye valid hai.</p>
      </div>
    `,
  });
};

// STEP 1: Register
exports.register = async (req, res) => {
  try {
    const { name, email, phone, gender, password } = req.body;

    if (!name || !email || !phone || !gender || !password)
      return res.status(400).json({ message: "Sab fields required hain" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing && existing.emailVerified)
      return res.status(400).json({ message: "Email pehle se registered hai" });

    const otp = makeOtp();
    const hashed = await bcrypt.hash(password, 10);

    await User.findOneAndUpdate(
      { email: normalizedEmail },
      {
        name,
        email: normalizedEmail,
        phone,
        gender,
        password: hashed,
        emailVerified: false,
        otpCode: otp,
        otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    try {
      await sendOtpMail(normalizedEmail, otp);
    } catch (mailErr) {
      return res.status(500).json({
        message: "OTP email send nahi hua. EMAIL_USER aur EMAIL_PASS env check karo.",
        debug: mailErr.message,
      });
    }

    res.status(201).json({
      message: "OTP aapke email par send ho gaya hai. Verify karne ke baad next step chalega.",
      email: normalizedEmail,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ message: "Email aur OTP do" });

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(404).json({ message: "User nahi mila" });

    if (!user.otpCode || !user.otpExpiresAt)
      return res.status(400).json({ message: "OTP request nahi hua hai. Register phir se karo." });

    const isExpired = new Date(user.otpExpiresAt).getTime() < Date.now();
    if (isExpired) {
      user.otpCode = "";
      user.otpExpiresAt = null;
      await user.save();
      return res.status(400).json({ message: "OTP expire ho gaya hai. Naya OTP mangao." });
    }

    if (String(user.otpCode) !== String(otp).trim())
      return res.status(400).json({ message: "OTP galat hai" });

    user.emailVerified = true;
    user.otpCode = "";
    user.otpExpiresAt = null;
    await user.save();

    res.json({
      message: "Email verify ho gaya hai.",
      token: makeToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, profilePic: user.profilePic },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email do" });

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(404).json({ message: "User nahi mila" });

    const otp = makeOtp();
    user.otpCode = otp;
    user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    user.emailVerified = false;
    await user.save();

    await sendOtpMail(user.email, otp);
    res.json({ message: "A new OTP has been sent to your email." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// STEP 2: Profile complete (protected)
exports.completeProfile = async (req, res) => {
  try {
    const { bio, education } = req.body;
    const update = { bio, education };

    if (req.file) {
      update.profilePic = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// LOGIN
exports.loginRequestOtp = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const deleted = await ensureAccountNotExpired(user);
    if (deleted) return res.status(410).json({ message: "Your account was permanently deleted because it was not reactivated within 48 hours." });

    if (!user.emailVerified)
      return res.status(400).json({ message: "Email is not verified yet. Please complete registration verification first." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const otp = makeOtp();
    user.loginOtpCode = otp;
    user.loginOtpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();

    await sendOtpMail(user.email, otp);

    res.json({
      message: "OTP sent to your email for login verification.",
      email: user.email,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.loginVerifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.loginOtpCode || !user.loginOtpExpiresAt)
      return res.status(400).json({ message: "No OTP request found. Please request login OTP again." });

    const isExpired = new Date(user.loginOtpExpiresAt).getTime() < Date.now();
    if (isExpired) {
      user.loginOtpCode = "";
      user.loginOtpExpiresAt = null;
      await user.save();
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    if (String(user.loginOtpCode) !== String(otp).trim())
      return res.status(400).json({ message: "Invalid OTP" });

    user.loginOtpCode = "";
    user.loginOtpExpiresAt = null;
    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      token: makeToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, profilePic: user.profilePic },
      message: "Login verified successfully.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const deleted = await ensureAccountNotExpired(user);
    if (deleted) return res.status(410).json({ message: "Your account was permanently deleted because it was not reactivated within 48 hours." });

    if (!user.emailVerified)
      return res.status(400).json({ message: "Email is not verified yet. Please complete registration verification first." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      token: makeToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, profilePic: user.profilePic },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Current user
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const deleted = await ensureAccountNotExpired(user);
  if (deleted) return res.status(410).json({ message: "Aapka account permanent delete ho gaya hai." });

  user.lastActiveAt = new Date();
  await user.save();
  res.json({ user });
};

exports.deactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isDeactivated = true;
    user.deactivatedAt = new Date();
    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      message: "Account deactivate ho gaya hai. 48 ghante ke andar reactivate nahi kiya to account permanent delete ho jayega.",
      autoDeleteInHours: 48,
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isDeactivated = false;
    user.deactivatedAt = null;
    user.lastActiveAt = new Date();
    await user.save();

    res.json({
      message: "Account successfully reactivate ho gaya hai.",
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// UPDATE PROFILE
exports.updateMe = async (req, res) => {
  try {
    const update = {};
    ["name", "phone", "gender", "bio", "education"].forEach((k) => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    if (req.file) {
      update.profilePic = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    }
    const user = await User.findByIdAndUpdate(req.user.id, update, {
      new: true,
      runValidators: true,
    });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CHANGE PASSWORD
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ message: "Naya password kam se kam 6 character ka ho" });

    const user = await User.findById(req.user.id).select("+password");
    const ok = await bcrypt.compare(oldPassword || "", user.password);
    if (!ok) return res.status(400).json({ message: "Purana password galat hai" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password change ho gaya" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};