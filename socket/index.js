const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const FriendRequest = require("../models/FriendRequest");
const { serializeMessage } = require("../utils/helpers");

const online = new Map(); // userId -> kitne tabs/devices connected
const receiptsOn = (u) => u?.settings?.readReceipts !== false;

const broadcastPresence = (io, u) =>
  io.emit("presence", {
    userId: String(u._id),
    isOnline: u.isOnline,
    lastSeen: u.settings?.showLastSeen === false ? null : u.lastSeen,
  });

// User online aaye to pending messages "delivered" mark karo
const markAllDelivered = async (io, uid) => {
  const chats = await Chat.find({ members: uid }).select("_id members");
  const map = new Map(chats.map((c) => [String(c._id), c]));
  const msgs = await Message.find({
    chat: { $in: chats.map((c) => c._id) },
    sender: { $ne: uid },
    deliveredTo: { $ne: uid },
  });
  for (const m of msgs) {
    const fresh = await Message.findByIdAndUpdate(m._id, { $addToSet: { deliveredTo: uid } }, { new: true });
    const chat = map.get(String(m.chat));
    io.to(`user:${m.sender}`).emit("message:update", serializeMessage(fresh, chat.members.length));
  }
};

module.exports = (io) => {
  io.use((socket, next) => {
    try {
      const p = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
      socket.userId = p.id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const uid = socket.userId;
    socket.join(`user:${uid}`);

    online.set(uid, (online.get(uid) || 0) + 1);
    if (online.get(uid) === 1) {
      const u = await User.findByIdAndUpdate(uid, { isOnline: true }, { new: true });
      if (u) broadcastPresence(io, u);
    }
    markAllDelivered(io, uid).catch(console.error);

    // ---------- MESSAGE SEND ----------
    socket.on("message:send", async ({ chatId, text }, ack) => {
      try {
        text = (text || "").trim();
        if (!text) return;

        const chat = await Chat.findOne({ _id: chatId, members: uid });
        if (!chat) throw new Error("Chat nahi mila");

        if (!chat.isGroup) {
          const otherId = String(chat.members.find((m) => String(m) !== uid));
          const [me, other] = await Promise.all([
            User.findById(uid).select("blocked"),
            User.findById(otherId).select("blocked"),
          ]);
          const iBlockedThem = me.blocked.some((b) => String(b) === otherId);
          const theyBlockedMe = other.blocked.some((b) => String(b) === uid);
          const friends = await FriendRequest.findOne({
            status: "accepted",
            $or: [{ from: uid, to: otherId }, { from: otherId, to: uid }],
          });
          if (theyBlockedMe || !friends) throw new Error("Message bhej nahi sakte");

          // Jab main unko block karta hoon tab message sender ko dikhe, recipient ko invisible rahe.
          // Us case me sender ke single tick ka status maintain rahe.
          const deliveredTo = iBlockedThem
            ? []
            : chat.members.filter((m) => String(m) !== uid && online.has(String(m)));
          const hiddenFrom = iBlockedThem ? [otherId] : [];
          const msg = await Message.create({ chat: chat._id, sender: uid, text, deliveredTo, hiddenFrom });
          await Chat.findByIdAndUpdate(chat._id, { lastMessage: msg._id });

          const payload = serializeMessage(msg, chat.members.length);
          chat.members
            .filter((m) => String(m) !== otherId || !iBlockedThem)
            .forEach((m) => io.to(`user:${m}`).emit("message:new", payload));
          ack?.({ ok: true });
          return;
        }

        // jo members abhi online hain unko turant "delivered"
        const deliveredTo = chat.members.filter(
          (m) => String(m) !== uid && online.has(String(m))
        );

        const msg = await Message.create({ chat: chat._id, sender: uid, text, deliveredTo });
        await Chat.findByIdAndUpdate(chat._id, { lastMessage: msg._id });

        const payload = serializeMessage(msg, chat.members.length);
        chat.members.forEach((m) => io.to(`user:${m}`).emit("message:new", payload));
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    // ---------- MESSAGE READ ----------
    socket.on("message:read", async ({ chatId }) => {
      try {
        const chat = await Chat.findOne({ _id: chatId, members: uid });
        if (!chat) return;

        const msgs = await Message.find({ chat: chatId, sender: { $ne: uid }, readBy: { $ne: uid } });
        if (msgs.length) {
          const reader = await User.findById(uid).select("settings");
          const senders = await User.find({
            _id: { $in: [...new Set(msgs.map((m) => String(m.sender)))] },
          }).select("settings");
          const sMap = new Map(senders.map((s) => [String(s._id), s]));

          for (const m of msgs) {
            const add = { readBy: uid, deliveredTo: uid };
            // blue tick tabhi jab reader aur sender dono ki receipts ON ho
            if (receiptsOn(reader) && receiptsOn(sMap.get(String(m.sender)))) add.seenBy = uid;

            const fresh = await Message.findByIdAndUpdate(m._id, { $addToSet: add }, { new: true });
            io.to(`user:${m.sender}`).emit("message:update", serializeMessage(fresh, chat.members.length));
          }
        }
        io.to(`user:${uid}`).emit("chat:read", { chatId }); // baaki tabs me unread hatao
      } catch (e) {
        console.error(e);
      }
    });

    // ---------- TYPING ----------
    socket.on("typing", async ({ chatId, isTyping }) => {
      const chat = await Chat.findOne({ _id: chatId, members: uid }).select("members");
      if (!chat) return;
      chat.members
        .filter((m) => String(m) !== uid)
        .forEach((m) => io.to(`user:${m}`).emit("typing", { chatId, userId: uid, isTyping }));
    });

    socket.on("user:logout", async () => {
      online.delete(uid);
      const u = await User.findByIdAndUpdate(uid, { isOnline: false, lastSeen: new Date() }, { new: true });
      if (u) broadcastPresence(io, u);
      socket.disconnect();
    });

    // ---------- DISCONNECT ----------
    socket.on("disconnect", async () => {
      const c = (online.get(uid) || 1) - 1;
      if (c <= 0) {
        online.delete(uid);
        const u = await User.findByIdAndUpdate(uid, { isOnline: false, lastSeen: new Date() }, { new: true });
        if (u) broadcastPresence(io, u);
      } else online.set(uid, c);
    });
  });
};