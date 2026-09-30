const router = require("express").Router();
const u = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");

router.use(protect);
router.get("/", u.listUsers);
router.get("/blocked", u.blockedList);
router.get("/profile/:id", u.getProfile);
router.put("/settings", u.updateSettings);
router.post("/block/:id", u.block);
router.delete("/block/:id", u.unblock);

module.exports = router;