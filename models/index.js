// models/index.js — re-export Mongoose models
const User = require("./user.js");
const Message = require("./message.js");

module.exports = { User, Message };
