require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const connectDB = require('./config/db');
const registerSocketHandlers = require('./sockets');
const { deleteExpiredEphemeralMessages } = require('./services/chatService');

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

app.set('io', io);

registerSocketHandlers(io);

setInterval(async () => {
  try {
    const result = await deleteExpiredEphemeralMessages();
    if (result.deletedCount > 0) {
      result.messageIds.forEach((messageId) => {
        io.emit('chat:message:deleted', { messageId });
      });
    }
  } catch (_error) {
    // Cleanup failures are non-fatal and should not terminate the API process.
  }
}, 30 * 1000);

async function startServer() {
  await connectDB();

  const MAX_PORT_ATTEMPTS = 15;

  function bind(port, attempt = 0) {
    const onError = (error) => {
      if (error && error.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS - 1) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is already in use. Retrying on ${nextPort}...`);
        bind(nextPort, attempt + 1);
        return;
      }

      console.error(`Unable to start API after trying ${attempt + 1} port(s).`);
      throw error;
    };

    server.once('error', onError);

    server.listen(port, () => {
      server.removeListener('error', onError);
      console.log(`Secure Chat API running on port ${port}`);
      if (port !== PORT) {
        console.log(`Configured port ${PORT} was busy; using fallback port ${port}.`);
      }
    });
  }

  bind(PORT);
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
