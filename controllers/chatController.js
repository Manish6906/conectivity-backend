const User = require("../models/User");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const FriendRequest = require("../models/FriendRequest");
const { pubUser, serializeMessage } = require("../utils/helpers");

const F = "name profilePic isOnline lastSeen settings";
const notify = (req, ids) =>
  ids.forEach((id) => req.app.get("io").to(`user:${id}`).emit("chats:changed"));

const shape = async (c, meId, myBlocked) => {
  const unread = await Message.countDocuments({
    chat: c._id,
    sender: { $ne: meId },
    readBy: { $ne: meId },
    hiddenFrom: { $ne: meId },
  });
  const members = c.members.map(pubUser);
  const other = c.isGroup ? null : members.find((m) => m._id !== meId);
  let lastMessage = c.lastMessage ? serializeMessage(c.lastMessage, c.members.length) : null;
  if (c.lastMessage && c.lastMessage.hiddenFrom?.some((u) => String(u) === String(meId))) {
    lastMessage = null;
  }
  return {
    _id: String(c._id),
    isGroup: c.isGroup,
    name: c.name,
    admin: c.admin ? String(c.admin) : null,
    members,
    unread,
    iBlocked: !!other && myBlocked.includes(other._id),
    lastMessage,
    updatedAt: c.updatedAt,
  };
};

const areFriends = (a, b) =>
  FriendRequest.findOne({
    status: "accepted",
    $or: [{ from: a, to: b }, { from: b, to: a }],
  });

const fullChat = (id) => Chat.findById(id).populate("members", F).populate("lastMessage");

exports.list = async (req, res) => {
  try {
    const id = req.user.id;
    const me = await User.findById(id).select("blocked");
    const myBlocked = me.blocked.map(String);
    const chats = await Chat.find({ members: id })
      .populate("members", F)
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    const visible = chats.filter(
      (c) => c.isGroup || (c.lastMessage && !c.lastMessage.hiddenFrom?.some((u) => String(u) === String(id)))
    );
    const out = await Promise.all(visible.map((c) => shape(c, id, myBlocked)));
    res.json({ chats: out });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOne = async (req, res) => {
  const id = req.user.id;
  const chat = await Chat.findOne({ _id: req.params.id, members: id })
    .populate("members", F)
    .populate("lastMessage");
  if (!chat) return res.status(404).json({ message: "Chat nahi mila" });
  const me = await User.findById(id).select("blocked");
  res.json({ chat: await shape(chat, id, me.blocked.map(String)) });
};

// 1-1 chat kholo/banao (sirf friends ke sath)
exports.direct = async (req, res) => {
  try {
    const me = req.user.id;
    const other = req.params.userId;
    if (!(await areFriends(me, other)))
      return res.status(403).json({ message: "Pehle friend bano" });

    const key = [me, other].sort().join("_");
    let chat = await Chat.findOne({ pairKey: key });
    if (!chat) chat = await Chat.create({ members: [me, other], pairKey: key });

    const meDoc = await User.findById(me).select("blocked");
    const full = await fullChat(chat._id);
    res.json({ chat: await shape(full, me, meDoc.blocked.map(String)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.group = async (req, res) => {
  try {
    const me = req.user.id;
    const { name, members } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Group ka naam do" });
    if (!Array.isArray(members) || members.length < 1)
      return res.status(400).json({ message: "Kam se kam 1 member chuno" });

    const fr = await FriendRequest.find({
      status: "accepted",
      $or: [{ from: me }, { to: me }],
    });
    const friendIds = new Set(fr.map((f) => (String(f.from) === me ? String(f.to) : String(f.from))));
    if (!members.every((m) => friendIds.has(String(m))))
      return res.status(403).json({ message: "Sirf friends ko add kar sakte ho" });

    const all = [...new Set([me, ...members.map(String)])];
    const chat = await Chat.create({ isGroup: true, name: name.trim(), admin: me, members: all });

    notify(req, all);
    const meDoc = await User.findById(me).select("blocked");
    const full = await fullChat(chat._id);
    res.status(201).json({ chat: await shape(full, me, meDoc.blocked.map(String)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.messages = async (req, res) => {
  const chat = await Chat.findOne({ _id: req.params.id, members: req.user.id });
  if (!chat) return res.status(404).json({ message: "Chat nahi mila" });
  const msgs = await Message.find({
    chat: chat._id,
    hiddenFrom: { $ne: req.user.id },
  })
    .sort({ createdAt: 1 })
    .limit(500);
  res.json({ messages: msgs.map((m) => serializeMessage(m, chat.members.length)) });
};