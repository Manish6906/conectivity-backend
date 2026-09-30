const router = require("express").Router();
const c = require("../controllers/chatController");
const protect = require("../middleware/authMiddleware");

router.use(protect);
router.get("/", c.list);
router.post("/direct/:userId", c.direct);
router.post("/group", c.group);
router.get("/:id", c.getOne);
router.get("/:id/messages", c.messages);

module.exports = router;