const { createServer } = require("https");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const { createWorker } = require("./services/workerService");
const { initializeMediasoupSocket } = require("./socket/mediasoupSocket");
const mailRoutes = require("./routes/mailRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/mail", mailRoutes);

const options = {
  key: fs.readFileSync("./ssl/webserver.key"),
  cert: fs.readFileSync("./ssl/webserver.crt"),
};

const httpsServer = createServer(options, app);

httpsServer.listen(8000, () => {
  console.log("HTTPS server running on port 8000");
});

// Mounting Socket.io on our HTTP server
const io = new Server(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Mediasoup
const connections = io.of("/mediasoup");

// Initialize worker and socket handling
createWorker().then((worker) => {
  initializeMediasoupSocket(connections, worker);
});
