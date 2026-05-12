const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../config/db');
const UserProfile = require('../models/UserProfile');

async function run() {
  await connectDB();
  try {
    await UserProfile.syncIndexes();
    console.log('UserProfile indexes created.');
  } catch (error) {
    console.error('Failed to create profile indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
