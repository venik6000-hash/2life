const crypto = require("crypto");

const TICKET_TTL_MS = 30_000;

// ticket -> { id, username, role, expiry }
const tickets = new Map();

const createWsTicket = (user) => {
  const ticket = crypto.randomBytes(32).toString("hex");
  tickets.set(ticket, {
    id: user.id,
    username: user.username,
    role: user.role,
    expiry: Date.now() + TICKET_TTL_MS,
  });
  return ticket;
};

const consumeWsTicket = (ticket) => {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  if (Date.now() > entry.expiry) return null;
  return entry;
};

module.exports = { createWsTicket, consumeWsTicket };
