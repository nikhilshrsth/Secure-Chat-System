function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('room:join', (roomId) => {
      socket.join(roomId);
    });
  });
}

module.exports = registerSocketHandlers;
