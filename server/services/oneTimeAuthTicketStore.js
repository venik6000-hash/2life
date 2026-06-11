const crypto = require("crypto");

const TICKET_TTL_MS = 30_000;

const createOneTimeAuthTicketStore = ({ decorateEntry = () => ({}) } = {}) => {
  const tickets = new Map();

  const create = (user, context) => {
    const ticket = crypto.randomBytes(32).toString("hex");
    tickets.set(ticket, {
      id: user.id,
      username: user.username,
      role: user.role,
      jti: user.jti || null,
      token_version: Number(user.token_version || 0),
      ...decorateEntry(user, context),
      expiry: Date.now() + TICKET_TTL_MS,
    });
    return ticket;
  };

  const consume = (ticket) => {
    const entry = tickets.get(ticket);
    if (!entry) return null;
    tickets.delete(ticket);
    if (Date.now() > entry.expiry) return null;
    return entry;
  };

  return { create, consume };
};

module.exports = { createOneTimeAuthTicketStore };
