const router = require("express").Router();
const f = require("../controllers/friendController");
const protect = require("../middleware/authMiddleware");

router.use(protect);
router.get("/", f.friends);
router.get("/sent", f.sent);
router.get("/received", f.received);
router.get("/rejected", f.rejected);
router.post("/request/:userId", f.sendRequest);
router.put("/accept/:id", f.accept);
router.put("/reject/:id", f.reject);
router.delete("/request/:id", f.cancel);

module.exports = router;