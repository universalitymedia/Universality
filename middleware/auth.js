function requireClipper(req, res, next) {
  if (!req.session.clipperId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function isOpsAdmin(discordId) {
  const allowed = (process.env.OPS_ADMIN_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return !!discordId && allowed.includes(discordId);
}

function requireOpsAdmin(req, res, next) {
  if (!req.session.discordId) return res.status(401).json({ error: 'Not logged in' });
  // Fail closed: an empty allow-list means nobody gets in, not everybody.
  if (!isOpsAdmin(req.session.discordId)) {
    return res.status(403).json({ error: 'Not authorized for the ops dashboard' });
  }
  next();
}

module.exports = { requireClipper, requireOpsAdmin, isOpsAdmin };
