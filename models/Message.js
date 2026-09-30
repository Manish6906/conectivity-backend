const mongoose = require("mongoose");
const ref = (m) => [{ type: mongoose.Schema.Types.ObjectId, ref: m }];

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    deliveredTo: ref("User"), // double tick (grey)
    readBy: ref("User"),      // unread count ke liye (hamesha save hota hai)
    seenBy: ref("User"),      // blue tick (sirf jab dono ki read receipts ON ho)
    hiddenFrom: ref("User"),  // blocked user ko message hide karne ke liye
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);