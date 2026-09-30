require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io);

connectDB().then(() => User.updateMany({}, { isOnline: false })); // restart par sab offline

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/friends", require("./routes/friendRoutes"));
app.use("/api/chats", require("./routes/chatRoutes"));

require("./socket")(io);

server.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);