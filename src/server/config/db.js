const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/securechat';

  mongoose.set('strictQuery', true);

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');

  // Migrate existing documents: unset googleId/phoneNumber where they are null
  // so MongoDB sparse unique indexes skip them (sparse indexes index null values,
  // but do not index missing fields).
  const db = mongoose.connection.db;
  const users = db.collection('users');
  await users.updateMany({ googleId: null }, { $unset: { googleId: '' } });
  await users.updateMany({ phoneNumber: null }, { $unset: { phoneNumber: '' } });
}

module.exports = connectDB;
