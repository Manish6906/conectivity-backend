exports.pubUser = (u) => ({
  _id: String(u._id),
  name: u.name,
  profilePic: u.profilePic,
  bio: u.bio,
  isOnline: u.isOnline,
  lastSeen: u.settings?.showLastSeen === false ? null : u.lastSeen,
});

exports.getVisibleProfile = (viewerId, target, relation = "none") => {
  const base = {
    _id: String(target._id),
    name: target.name,
    profilePic: target.profilePic,
    bio: target.bio || "",
    education: target.education || "",
    gender: target.gender,
    isOnline: target.isOnline,
    lastSeen: target.settings?.showLastSeen === false ? null : target.lastSeen,
    privacy: {
      showPhone: !!target.privacy?.showPhone,
      showEmail: !!target.privacy?.showEmail,
    },
  };

  const isSelf = String(viewerId) === String(target._id);
  const canShowPhone = isSelf || relation === "friends" ? !!target.privacy?.showPhone : false;
  const canShowEmail = isSelf || relation === "friends" ? !!target.privacy?.showEmail : false;

  if (canShowPhone) base.phone = target.phone;
  if (canShowEmail) base.email = target.email;

  return base;
};

// status: sent | delivered | seen
exports.serializeMessage = (m, memberCount) => {
  const o = m.toObject ? m.toObject() : m;
  const others = memberCount - 1;
  let status = "sent";
  if (o.seenBy.length >= others) status = "seen";
  else if (o.deliveredTo.length >= others) status = "delivered";
  return {
    _id: String(o._id),
    chat: String(o.chat),
    sender: String(o.sender),
    text: o.text,
    createdAt: o.createdAt,
    status,
  };
};