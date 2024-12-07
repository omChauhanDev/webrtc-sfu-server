const { createServer } = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");
const fs = require("fs");

const { createWorker } = require("./services/workerService");
const { initializeMediasoupSocket } = require("./socket/mediasoupSocket");

// const httpServer = createServer();

// for prod
const options = {
  key: fs.readFileSync("/home/ubuntu/ssl/selfsigned.key"),
  cert: fs.readFileSync("/home/ubuntu/ssl/selfsigned.crt"),
};

const httpsServer = createServer(options);

httpsServer.listen(8000, () => {
  console.log("HTTP server running on port 8000");
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
