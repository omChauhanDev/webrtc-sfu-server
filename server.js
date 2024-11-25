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
const connections = io.of("/mediasoup");

let worker;
// let router;
let spaces = {}; // Each space store its own router and an array of socketId of all its peers.
let peers = {}; // Each peer store its spaceId, socket(obj), all transports ids, all producers ids, all consumers ids and peerDetails(name, role)
// let producerTransport;
// let consumerTransport;
let transports = []; // Each entry store its socketId, spaceId, consumer? and transport(obj).
// let producer;
// let consumer;
let producers = []; // Each entry store the socketId, spaceId and producer(obj).
let consumers = []; // Each entry store the socketId,spaceId and consumer(obj).

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

const createSpace = async (spaceId, socketId) => {
  let router1;
  let peers = [];
  console.log("Does space exist ?", spaces[spaceId]);
  if (spaces[spaceId]) {
    router1 = spaces[spaceId].router;
    peers = spaces[spaceId].peers || [];
  } else {
    router1 = await worker.createRouter({ mediaCodecs }); // Each space has its own router
  }

  spaces[spaceId] = {
    router: router1,
    peers: [...peers, socketId],
  };
  console.log(`after joining Router ID: ${router1.id}`, peers.length);
  return router1;
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

connections.on("connection", async (socket) => {
  // Step 1 : Client Getting connected
  console.log("New socket-client connection:", socket.id);
  socket.emit("client-connected", {
    socketId: socket.id,
  });

  // Step 2 : Listen for sync-space event
  socket.on("sync-space", async ({ spaceId }, callback) => {
    const router1 = await createSpace(spaceId, socket.id);

    peers[socket.id] = {
      socket,
      spaceId,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: "Peer",
        role: "Member",
      },
    };

    const rtpCapabilities = router1.rtpCapabilities;
    // const isProducerExist = spaces[spaceId].producers.length > 0;
    const isProducerExist = producers.some(
      (producer) => producer.spaceId === spaceId
    );
    callback({
      rtpCapabilities,
      // Also have to give info that do any Prdoucer exist in this space
      isProducerExist,
    });
  });

  // // Step 2 : Sending rtp capabilities to the client
  // router = await worker.createRouter({ mediaCodecs }); // Each space has its own router
  // socket.emit("router-rtp-capabilities ", router.rtpCapabilities);

  // Step 3 : Create Transport and send it to client (Used by client as producer or consumer)
  socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
    const spaceId = peers[socket.id].spaceId;

    const router = spaces[spaceId].router;
    // console.log("Is it a sender?", sender);
    // if (sender) {
    //   producerTransport = await createWebRtcTransport(callback);
    // } else {
    //   consumerTransport = await createWebRtcTransport(callback);
    // }
    createWebRtcTransport(router).then(
      (transport) => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });

        // adding transport to our data structures
        addTransport(transport, spaceId, consumer);
      },
      (error) => {
        console.log(error);
      }
    );
  });

  const addTransport = (transport, spaceId, consumer) => {
    transports = [
      ...transports,
      {
        socketId: socket.id,
        transport,
        spaceId,
        consumer,
      },
    ];

    peers[socket.id] = {
      ...peers[socket.id],
      transports: [...peers[socket.id].transports, transport.id],
    };

    console.log("After adding transport", transports);
  };

  const addProducer = (producer, spaceId) => {
    producers = [
      ...producers,
      {
        socketId: socket.id,
        producer,
        spaceId,
      },
    ];

    peers[socket.id] = {
      ...peers[socket.id],
      producers: [...peers[socket.id].producers, producer.id],
    };
  };

  const addConsumer = (consumer, spaceId) => {
    // to the consuers list
    consumers = [
      ...consumers,
      {
        socketId: socket.id,
        consumer,
        spaceId,
      },
    ];

    // to the peers list
    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [...peers[socket.id].consumers, consumer.id],
    };
  };

  socket.on("get-producers", (callback) => {
    const { spaceId } = peers[socket.id];
    let producersList = [];
    producers.forEach((producerData) => {
      if (
        producerData.spaceId === spaceId &&
        producerData.socketId !== socket.id
      ) {
        producersList = [...producersList, producerData.producer.id];
      }
    });
    callback(producersList);
  });

  const getTransport = (socketId) => {
    const [producerTransport] = transports.filter(
      (transport) => transport.socketId === socketId && !transport.consumer
    );
    return producerTransport.transport;
  };

  const informExistingMembers = (spaceId, socketId, producerId) => {
    console.log(
      "Informing all peers of this space about new producer",
      spaceId,
      socketId,
      producerId
    );
    // tell all peers in this space that a new producer has joined
    const existingMembers = spaces[spaceId].peers.filter(
      (peer) => peer !== socketId
    );
    console.log("Existing members in this space", existingMembers);
    existingMembers.forEach((member) => {
      socket.to(member).emit("new-producer-joined", { producerId });
    });
  };

  // Receive dtlsParameters from client Producer
  socket.on("transport-connect", ({ dtlsParameters }) => {
    console.log("DTLS parameters from client producer : ", dtlsParameters);
    // await producerTransport.connect({ dtlsParameters });
    getTransport(socket.id).connect({ dtlsParameters });
  });

  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      const producer = await getTransport(socket.id).produce({
        kind,
        rtpParameters,
      });

      // storing this created producer
      const { spaceId } = peers[socket.id];
      addProducer(producer, spaceId);

      informExistingMembers(spaceId, socket.id, producer.id);

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

  // For Consumer
  socket.on(
    "transport-recv-connect",
    async ({ dtlsParameters, serverConsumerTransportId }) => {
      console.log("DTLS parameters from client consumer : ", dtlsParameters);
      console.log(
        "Searching for transport with id: ",
        serverConsumerTransportId
      );
      const consumerTransport = transports.find(
        (transportData) =>
          transportData.consumer &&
          transportData.transport.id === serverConsumerTransportId
      ).transport;
      await consumerTransport.connect({ dtlsParameters });
    }
  );

  socket.on(
    "consume",
    async (
      { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
      callback
    ) => {
      try {
        // console.log(
        //   "Consume event triggered on server for producerId: ",
        //   remoteProducerId
        // );
        const { spaceId } = peers[socket.id];
        const router = spaces[spaceId].router;
        let consumerTransport = transports.find(
          (transportData) =>
            transportData.consumer &&
            transportData.transport.id === serverConsumerTransportId
        ).transport;

        // console.log("Consumer rtpCapabilities", rtpCapabilities);
        // console.log("Router rtpCapabilities", router.rtpCapabilities);
        console.log("On Consume evet");
        console.log("Router Id", router.id);
        console.log("Producer Id for consuming", remoteProducerId);

        const producer = producers.find(
          (p) => p.producer.id === remoteProducerId
        );
        if (!producer) {
          console.error("Producer not found!");
          return;
        }
        // Normal flow
        const canConsume = router.canConsume({
          producerId: remoteProducerId,
          rtpCapabilities,
        });
        console.log("Router can consume?", canConsume);

        if (canConsume) {
          console.log(
            "Consumer can be created and now doing consumerTransport.consume()"
          );
          const consumer = await consumerTransport.consume({
            producerId: remoteProducerId,
            rtpCapabilities,
            paused: true,
          });

          consumer.on("transportclose", () => {
            console.log("Transport closed for this Consumer");
            // consumer.close();
          });

          consumer.on("producerclose", () => {
            console.log("Producer closed for this Consumer");
            socket.emit("producer-closed-connection", { remoteProducerId });

            consumerTransport.close([]);
            transports = transports.filter(
              (transportData) =>
                transportData.transport.id !== serverConsumerTransportId
            );
            consumers.close();
            consumers = consumers.filter(
              (consumerData) => consumerData.consumer.id !== consumer.id
            );
          });

          addConsumer(consumer, spaceId);

          const params = {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          };

          callback({ params });
        }
      } catch (error) {
        console.log(error.message);
        callback({
          params: {
            error: error,
          },
        });
      }
    }
  );

  socket.on("consumer-resume", async ({ serverConsumerTransportId }) => {
    console.log(
      "Attempting to resume consumer with id: ",
      serverConsumerTransportId
    );
    const { consumer } = consumers.find(
      (consumerData) => consumerData.consumer.id === serverConsumerTransportId
    );
    await consumer.resume();
    console.log("Consumer resumed successfully from server");
  });

  const removeItems = (items, socketId, type) => {
    items.forEach((item) => {
      if (item.socketId === socketId) {
        item[type].close();

        // Tell all members that a producer is closed
        // if(type==="producer"){
        // }
      }
    });
    items = items.filter((item) => item.socketId !== socketId);
    return items;
  };

  socket.on("disconnect", () => {
    console.log("Socket-client disconnected:", {
      socketId: socket.id,
    });

    consumers = removeItems(consumers, socket.id, "consumer");
    producers = removeItems(producers, socket.id, "producer");
    transports = removeItems(transports, socket.id, "transport");

    // const { spaceId } = peers[socket.id];
    if (peers[socket.id]) {
      const { spaceId } = peers[socket.id];
      // rest of your disconnect handling code
      delete peers[socket.id];
      spaces[spaceId] = {
        router: spaces[spaceId].router,
        peers: spaces[spaceId].peers.filter((peer) => peer !== socket.id),
      };
    } else {
      console.log(`No peer found for socket ID: ${socket.id}`);
    }
  });
});

const createWebRtcTransport = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      const webRtcTransport_options = {
        listenIps: [
          {
            ip: "0.0.0.0",
            announcedIp: "127.0.0.1",
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

      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};
