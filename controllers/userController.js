const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const { pubUser, getVisibleProfile } = require("../utils/helpers");

const notify = (req, ...ids) =>
  ids.forEach((id) => req.app.get("io").to(`user:${id}`).emit("friends:changed"));

// Sab registered users + relation
exports.listUsers = async (req, res) => {
  try {
    const meId = req.user.id;
    const me = await User.findById(meId).select("blocked");
    const users = await User.find({ _id: { $ne: meId } }).sort({ name: 1 });
    const reqs = await FriendRequest.find({ $or: [{ from: meId }, { to: meId }] });

    const list = users.map((u) => {
      const uid = String(u._id);
      const r = reqs.find((x) => String(x.from) === uid || String(x.to) === uid);
      let relation = "none";
      let requestId = null;

      if (me.blocked.some((b) => String(b) === uid)) relation = "blocked";
      if (r) {
        requestId = r._id;
        if (relation !== "blocked") {
          const fromMe = String(r.from) === meId;
          if (r.status === "accepted") relation = "friends";
          else if (r.status === "pending") relation = fromMe ? "sent" : "received";
          else if (r.status === "rejected") relation = fromMe ? "rejected" : "none";
        }
      }
      return { ...pubUser(u), relation, requestId };
    });

    res.json({ users: list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.block = async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { $addToSet: { blocked: req.params.id } });
  notify(req, req.user.id, req.params.id);
  res.json({ ok: true });
};

exports.unblock = async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { $pull: { blocked: req.params.id } });
  notify(req, req.user.id, req.params.id);
  res.json({ ok: true });
};

exports.blockedList = async (req, res) => {
  const me = await User.findById(req.user.id).populate("blocked");
  res.json({ users: me.blocked.map(pubUser) });
};

exports.getProfile = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const targetId = req.params.id;
    const [target, rel] = await Promise.all([
      User.findById(targetId),
      FriendRequest.findOne({
        status: "accepted",
        $or: [{ from: viewerId, to: targetId }, { from: targetId, to: viewerId }],
      }),
    ]);

    if (!target) return res.status(404).json({ message: "User nahi mila" });
    const relation = String(targetId) === String(viewerId) ? "self" : rel ? "friends" : "none";
    const publicProfile = getVisibleProfile(viewerId, target, relation);
    res.json({ user: publicProfile });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  const { readReceipts, showLastSeen, privacy } = req.body;
  const set = {};
  if (typeof readReceipts === "boolean") set["settings.readReceipts"] = readReceipts;
  if (typeof showLastSeen === "boolean") set["settings.showLastSeen"] = showLastSeen;
  if (privacy) {
    if (typeof privacy.showPhone === "boolean") set["privacy.showPhone"] = privacy.showPhone;
    if (typeof privacy.showEmail === "boolean") set["privacy.showEmail"] = privacy.showEmail;
  }
  const user = await User.findByIdAndUpdate(req.user.id, { $set: set }, { new: true });
  res.json({ user });
};