const mongoose = require('mongoose');

const connectDB = async (retries = 10) => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI is not defined!');
    console.error('Please check your .env file exists and contains:');
    console.error('  MONGODB_URI=mongodb://127.0.0.1:27017/qarrab_db');
    process.exit(1);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt}/${retries}: ${error.message}`);
      if (attempt === retries) {
        console.error('Giving up — server keeps running so /health still answers; set MONGODB_URI correctly.');
        return null;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

module.exports = connectDB;
