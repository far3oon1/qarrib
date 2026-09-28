// Minimal canary: no dependencies, no DB — proves function routing works.
module.exports = (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
};
