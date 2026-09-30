const router = require("express").Router();
const auth = require("../controllers/authController");
const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

router.post("/register", auth.register);
router.post("/verify-otp", auth.verifyOtp);
router.post("/resend-otp", auth.resendOtp);
router.post("/login/request-otp", auth.loginRequestOtp);
router.post("/login/verify-otp", auth.loginVerifyOtp);
router.post("/login", auth.login);
router.post("/deactivate", protect, auth.deactivateAccount);
router.post("/reactivate", protect, auth.reactivateAccount);
router.put("/complete-profile", protect, upload.single("profilePic"), auth.completeProfile);
router.get("/me", protect, auth.getMe);
router.put("/me", protect, upload.single("profilePic"), auth.updateMe);
router.put("/password", protect, auth.changePassword);

module.exports = router;