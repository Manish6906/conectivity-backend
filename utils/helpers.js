exports.pubUser = (u) => ({
  _id: String(u._id),
  name: u.name,
  profilePic: u.profilePic,
  bio: u.bio,
  isOnline: u.isOnline,
  lastSeen: u.settings?.showLastSeen === false ? null : u.lastSeen,
  isDeactivated: !!u.isDeactivated,
});

exports.getVisibleProfile = (viewerId, target, relation = "none") => {
  const isSelf = String(viewerId) === String(target._id);

  if (!isSelf && target.isDeactivated) {
    return {
      _id: String(target._id),
      name: "Deactivated account",
      profilePic: target.profilePic || null,
      bio: "This account is currently deactivated.",
      education: "",
      gender: "",
      isOnline: false,
      lastSeen: null,
      isDeactivated: true,
      privacy: { showPhone: false, showEmail: false },
    };
  }

  const base = {
    _id: String(target._id),
    name: target.name,
    profilePic: target.profilePic,
    bio: target.bio || "",
    education: target.education || "",
    gender: target.gender,
    isOnline: target.isOnline,
    lastSeen: target.settings?.showLastSeen === false ? null : target.lastSeen,
    isDeactivated: !!target.isDeactivated,
    privacy: {
      showPhone: !!target.privacy?.showPhone,
      showEmail: !!target.privacy?.showEmail,
    },
  };

  const canShowPhone = isSelf || relation === "friends" ? !!target.privacy?.showPhone : false;
  const canShowEmail = isSelf || relation === "friends" ? !!target.privacy?.showEmail : false;

  if (canShowPhone) base.phone = target.phone;
  if (canShowEmail) base.email = target.email;

  return base;
};

// status: sent | delivered | seen
exports.serializeMessage = (m, memberCount) => {
  const o = m.toObject ? m.toObject() : m;
  const seenBy = Array.isArray(o.seenBy) ? o.seenBy : [];
  const deliveredTo = Array.isArray(o.deliveredTo) ? o.deliveredTo : [];
  const others = Math.max((Number(memberCount) || 1) - 1, 0);

  let status = "sent";
  if (seenBy.length >= others) status = "seen";
  else if (deliveredTo.length >= others) status = "delivered";

  return {
    _id: String(o._id),
    chat: String(o.chat),
    sender: String(o.sender),
    text: o.text,
    createdAt: o.createdAt,
    status,
  };
};