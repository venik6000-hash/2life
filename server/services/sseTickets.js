const { createOneTimeAuthTicketStore } = require("./oneTimeAuthTicketStore");

const ticketStore = createOneTimeAuthTicketStore();

const createTicket = (user) => ticketStore.create(user);
const consumeTicket = (ticket) => ticketStore.consume(ticket);

module.exports = { createTicket, consumeTicket };
