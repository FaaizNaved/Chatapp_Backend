// config/db.js — MongoDB connection via Mongoose
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatapp";
  await mongoose.connect(uri);
  console.log("✅ MongoDB connected:", mongoose.connection.host);
}

module.exports = connectDB;
