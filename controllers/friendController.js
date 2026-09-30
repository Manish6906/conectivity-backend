const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const { pubUser } = require("../utils/helpers");

const F = "name profilePic bio isOnline lastSeen settings";
const notify = (req, ...ids) =>
  ids.forEach((id) => req.app.get("io").to(`user:${id}`).emit("friends:changed"));

// Request bhejo
exports.sendRequest = async (req, res) => {
  try {
    const me = req.user.id;
    const to = req.params.userId;
    if (me === to) return res.status(400).json({ message: "Khud ko request nahi bhej sakte" });

    const [target, meDoc] = await Promise.all([
      User.findById(to).select("blocked isDeactivated"),
      User.findById(me).select("blocked"),
    ]);
    if (!target) return res.status(404).json({ message: "User nahi mila" });
    if (target.isDeactivated)
      return res.status(403).json({ message: "Ye account deactivate hai. Request nahi bhej sakte." });
    if (target.blocked.some((b) => String(b) === me))
      return res.status(403).json({ message: "Request nahi bhej sakte" });
    if (meDoc.blocked.some((b) => String(b) === to))
      return res.status(400).json({ message: "Pehle unblock karo" });

    let fr = await FriendRequest.findOne({
      $or: [{ from: me, to }, { from: to, to: me }],
    });

    if (fr) {
      if (fr.status === "accepted") return res.status(400).json({ message: "Already friends" });
      if (fr.status === "pending") {
        if (String(fr.from) === to) {
          // samne wale ki request pehle se aayi hui thi, seedha accept
          fr.status = "accepted";
          await fr.save();
          notify(req, me, to);
          return res.json({ request: fr });
        }
        return res.status(400).json({ message: "Request pehle se bheji hui hai" });
      }
      // rejected tha, dobara bhejo
      fr.from = me;
      fr.to = to;
      fr.status = "pending";
      await fr.save();
    } else {
      fr = await FriendRequest.create({ from: me, to });
    }

    notify(req, me, to);
    res.status(201).json({ request: fr });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.accept = async (req, res) => {
  const fr = await FriendRequest.findOne({ _id: req.params.id, to: req.user.id, status: "pending" });
  if (!fr) return res.status(404).json({ message: "Request nahi mili" });
  fr.status = "accepted";
  await fr.save();
  notify(req, fr.from, fr.to);
  res.json({ request: fr });
};

exports.reject = async (req, res) => {
  const fr = await FriendRequest.findOne({ _id: req.params.id, to: req.user.id, status: "pending" });
  if (!fr) return res.status(404).json({ message: "Request nahi mili" });
  fr.status = "rejected";
  await fr.save();
  notify(req, fr.from, fr.to);
  res.json({ request: fr });
};

// Cancel (pending) ya Remove (rejected), dono me record delete
exports.cancel = async (req, res) => {
  const fr = await FriendRequest.findOneAndDelete({
    _id: req.params.id,
    from: req.user.id,
    status: { $ne: "accepted" },
  });
  if (!fr) return res.status(404).json({ message: "Request nahi mili" });
  notify(req, fr.from, fr.to);
  res.json({ ok: true });
};

const list = (getFilter, field) => async (req, res) => {
  const r = await FriendRequest.find(getFilter(req.user.id)).populate(field, F).sort({ updatedAt: -1 });
  res.json({
    requests: r.filter((x) => x[field]).map((x) => ({
      _id: x._id,
      user: pubUser(x[field]),
      createdAt: x.updatedAt,
    })),
  });
};

exports.sent = list((id) => ({ from: id, status: "pending" }), "to");
exports.received = list((id) => ({ to: id, status: "pending" }), "from");
exports.rejected = list((id) => ({ from: id, status: "rejected" }), "to");

exports.friends = async (req, res) => {
  const id = req.user.id;
  const r = await FriendRequest.find({
    status: "accepted",
    $or: [{ from: id }, { to: id }],
  }).populate("from to", F);
  res.json({
    friends: r.map((x) => pubUser(String(x.from._id) === id ? x.to : x.from)),
  });
};