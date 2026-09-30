require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((item) => item.trim()).filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  },
});
app.set("io", io);

connectDB().then(() => User.updateMany({}, { isOnline: false })); // restart par sab offline

app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/friends", require("./routes/friendRoutes"));
app.use("/api/chats", require("./routes/chatRoutes"));

require("./socket")(io);

const port = Number(process.env.PORT) || 5000;
server.listen(port, () => console.log(`Server running on port ${port}`));