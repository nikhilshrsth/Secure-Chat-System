require('dotenv').config();
const mongoose = require('mongoose');

const Message = require('../models/Message');
const ChatThread = require('../models/ChatThread');
const ChatRequest = require('../models/ChatRequest');
const EphemeralMessageLog = require('../models/EphemeralMessageLog');
const MessageIntegrityLog = require('../models/MessageIntegrityLog');
const User = require('../models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const results = {};
    results.messages = (await Message.deleteMany({})).deletedCount;
    results.threads = (await ChatThread.deleteMany({})).deletedCount;
    results.requests = (await ChatRequest.deleteMany({})).deletedCount;
    results.ephemeralLogs = (await EphemeralMessageLog.deleteMany({})).deletedCount;
    results.integrityLogs = (await MessageIntegrityLog.deleteMany({})).deletedCount;
    const userReset = await User.updateMany(
      {},
      { $set: { publicKey: null, keyExchangePublicKey: null } },
    );
    results.usersKeyReset = userReset.modifiedCount;

    console.log('Wipe complete:', results);
  } catch (error) {
    console.error('Wipe failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
