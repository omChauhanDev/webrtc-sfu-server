const { createServer } = require("http");
const { Server } = require("socket.io");
const mediasoup = require("mediasoup");

const httpServer = createServer();

httpServer.listen(8000, () => {
  console.log("HTTP server running on port 8000");
});

// Mounting Socket.io on our HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Mediasoup
const peers = io.of("/mediasoup");

let worker;
let router;
let producerTransport;
let consumerTranport;
let producer;

const createWorker = async () => {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
  console.log(`Worker created with id ${worker.pid}`);

  worker.on("died", (error) => {
    console.log("Worker died");
    setTimeout(() => process.exit(1), 2000);
    // worker = null;
  });
  return worker;
};

worker = createWorker();
// // No. of spaces = No. of routers

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

peers.on("connection", async (socket) => {
  // Step 1 : Client Getting connected
  console.log("New socket-client connection:", socket.id);
  socket.emit("client-connected", {
    socketId: socket.id,
  });

  // Step 2 : Sending rtp capabilities to the client
  router = await worker.createRouter({ mediaCodecs }); // Each space has its own router
  socket.emit("router-rtp-capabilities", router.rtpCapabilities);

  // Step 3 : Create Transport and send it to client (Used by client as producer)
  socket.on("createWebRtcTransport", async ({ sender }, callback) => {
    console.log("Is it a sender?", sender);
    if (sender) {
      producerTransport = await createWebRtcTransport(callback);
    } else {
      consumerTranport = await createWebRtcTransport(callback);
    }
  });

  // Receive dtlsParameters from client Producer
  socket.on("transport-connect", async ({ dtlsParameters }) => {
    console.log("DTLS parameters : ", dtlsParameters);
    await producerTransport.connect({ dtlsParameters });
  });

  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      producer = await producerTransport.produce({
        kind,
        rtpParameters,
      });

      console.log(
        "Producer Id :",
        producer.id,
        "Producer Kind :",
        producer.kind
      );

      producer.on("transportclose", () => {
        console.log("Transport closed for this Producer");
        producer.close();
      });

      callback({
        id: producer.id,
      });
    }
  );

  socket.on("disconnect", () => {
    console.log("Socket-client disconnected:", {
      socketId: socket.id,
    });
  });
});

const createWebRtcTransport = async (callback) => {
  try {
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: "127.0.0.1",
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };
    const transport = await router.createWebRtcTransport(
      webRtcTransport_options
    );
    console.log("Transport created", transport.id);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "close") {
        transport.close();
      }
    });

    transport.on("close", () => {
      console.log("Transport closed", transport.id);
    });

    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });
    return transport;
  } catch (error) {
    console.log(error);
    callback({
      params: {
        error: error,
      },
    });
  }
};
