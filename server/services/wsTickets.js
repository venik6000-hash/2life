const { createOneTimeAuthTicketStore } = require("./oneTimeAuthTicketStore");

const ticketStore = createOneTimeAuthTicketStore({
  decorateEntry: (_user, deviceId) => ({ deviceId: deviceId || null }),
});

const createWsTicket = (user, deviceId = null) => ticketStore.create(user, deviceId);
const consumeWsTicket = (ticket) => ticketStore.consume(ticket);

module.exports = { createWsTicket, consumeWsTicket };
