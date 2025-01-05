const { createSpace } = require("../services/spaceService");
const { createWebRtcTransport } = require("../services/transportService");

const initializeMediasoupSocket = (connections, worker) => {
  let spaces = {};
  let peers = {};
  let transports = [];
  let producers = [];
  let consumers = [];

  connections.on("connection", async (socket) => {
    // Step 1 : Client Getting connected
    console.log("New socket-client connection:", socket.id);
    socket.emit("client-connected", {
      socketId: socket.id,
    });

    // Step 2 : Listen for sync-space event
    socket.on("sync-space", async ({ spaceId, userData }, callback) => {
      console.log("Sync-space event triggered for spaceId", spaceId);
      const router1 = await createSpace(worker, spaces, spaceId, socket.id);

      peers[socket.id] = {
        socket,
        userData,
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
      const isProducerExist = producers.some(
        (producer) => producer.spaceId === spaceId
      );
      const allMembersInSpace = spaces[spaceId].peers;
      const allMembersData = allMembersInSpace.map((member) => {
        return {
          socketId: member,
          userData: peers[member].userData,
        };
      });
      informExistingMembers(spaceId, socket.id, "member-joined");
      callback({
        rtpCapabilities,
        isProducerExist,
        allMembersData,
      });
    });

    // Step 3 : Create Transport and send it to client (Used by client as producer or consumer)
    socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
      try {
        const spaceId = peers[socket.id].spaceId;
        const router = spaces[spaceId].router;

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
      } catch (error) {
        console.error("Transport creation failed:", error);
        throw error;
      }
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
      consumers = [
        ...consumers,
        {
          socketId: socket.id,
          consumer,
          spaceId,
        },
      ];

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
          producersList = [
            ...producersList,
            {
              producerId: producerData.producer.id,
              producerPersonalData: peers[producerData.socketId].userData,
            },
          ];
        }
      });
      console.log("Existing producers in this space", producersList.length);
      callback(producersList);
    });

    const getTransport = (socketId) => {
      const [producerTransport] = transports.filter(
        (transport) => transport.socketId === socketId && !transport.consumer
      );
      return producerTransport.transport;
    };

    const informExistingMembers = (
      spaceId,
      socketId,
      about,
      producerId = null
    ) => {
      console.log("Inform Existing peers called with params", {
        spaceId,
        socketId,
        about,
        producerId,
      });
      // tell all peers in this space that a new producer has joined
      if (!spaces[spaceId]) {
        return;
      }
      const existingMembers = spaces[spaceId].peers.filter(
        (peer) => peer !== socketId
      );
      if (about === "member-left") {
        existingMembers.forEach((member) => {
          socket.to(member).emit("member-left", { socketId });
        });
        return;
      }
      const memberPersonalData = peers[socketId].userData;
      if (about === "producer") {
        existingMembers.forEach((member) => {
          socket.to(member).emit("new-producer-joined", {
            producerId,
            socketId,
            memberPersonalData,
          });
        });
      } else if (about === "member-joined") {
        existingMembers.forEach((member) => {
          socket
            .to(member)
            .emit("new-member-joined", { socketId, memberPersonalData });
        });
      }
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

        // Update userData on server
        console.log("Updating userData on server");
        console.log("Producer kind", producer.kind);
        if (producer.kind === "video") {
          peers[socket.id].userData.isVideoOn = true;
          console.log("Is video on", peers[socket.id].userData.isVideoOn);
        } else if (producer.kind === "audio") {
          peers[socket.id].userData.isAudioOn = true;
          console.log("Is audio on", peers[socket.id].userData.isAudioOn);
        }
        informExistingMembers(spaceId, socket.id, "producer", producer.id);

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
          const { spaceId } = peers[socket.id];
          const router = spaces[spaceId].router;
          let consumerTransport = transports.find(
            (transportData) =>
              transportData.consumer &&
              transportData.transport.id === serverConsumerTransportId
          ).transport;

          console.log("On Consume event");
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
              consumer.close();
            });

            consumer.on("producerclose", () => {
              console.log(
                "Producer closed for this Consumer produerId",
                remoteProducerId
              );
              socket.emit("producer-closed-connection", {
                remoteProducerId,
              });

              consumerTransport.close();
              transports = transports.filter(
                (transportData) =>
                  transportData.transport.id !== serverConsumerTransportId
              );
              consumer.close();
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
        }
      });
      items = items.filter((item) => item.socketId !== socketId);
      return items;
    };

    // For video pause/resume
    socket.on("producer-pause", async ({ producerId }) => {
      const producer = producers.find((p) => p.producer.id === producerId);
      const kind = producer.producer.kind;
      console.log("Producer Pause triggered for kind", kind);
      // Update on server
      if (kind === "video") {
        peers[socket.id].userData.isVideoOn = false;
      } else if (kind === "audio") {
        peers[socket.id].userData.isAudioOn = false;
      }
      if (producer) {
        await producer.producer.pause();
        console.log(
          `Paused this producer with id: ${producer.producer.id} and kind: ${producer.producer.kind}`
        );
        // tell all peers in this space that an existing producer is paused
        const { spaceId } = peers[socket.id];
        const existingMembers = spaces[spaceId].peers.filter(
          (peer) => peer !== socket.id
        );
        console.log("Existing members in this space", existingMembers);
        existingMembers.forEach((member) => {
          socket.to(member).emit("producer-pause", {
            producerId,
            socketId: socket.id,
            isTrackOn: false,
          });
        });
      }
    });

    socket.on("producer-resume", async ({ producerId }) => {
      const producer = producers.find((p) => p.producer.id === producerId);
      const kind = producer.producer.kind;
      // Update on server
      if (kind === "video") {
        peers[socket.id].userData.isVideoOn = false;
      } else if (kind === "audio") {
        peers[socket.id].userData.isAudioOn = false;
      }
      if (producer) {
        await producer.producer.resume();
        console.log(
          `Resumed this producer with id: ${producer.producer.id} and kind: ${producer.producer.kind}`
        );
        // tell all peers in this space that an existing producer is resumed
        const { spaceId } = peers[socket.id];
        const existingMembers = spaces[spaceId].peers.filter(
          (peer) => peer !== socket.id
        );
        console.log("Existing members in this space", existingMembers);
        existingMembers.forEach((member) => {
          socket.to(member).emit("producer-resume", {
            producerId,
            socketId: socket.id,
            isTrackOn: true,
          });
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("Socket-client disconnected:", {
        socketId: socket.id,
      });

      consumers = removeItems(consumers, socket.id, "consumer");
      producers = removeItems(producers, socket.id, "producer");
      transports = removeItems(transports, socket.id, "transport");

      if (peers[socket.id]) {
        const { spaceId } = peers[socket.id];
        delete peers[socket.id];
        spaces[spaceId] = {
          router: spaces[spaceId].router,
          peers: spaces[spaceId].peers.filter((peer) => peer !== socket.id),
        };

        // For space cleanup
        if (spaces[spaceId].peers.length === 0) {
          spaces[spaceId].router.close();
          delete spaces[spaceId];
        }
        console.log("This peer left the space", socket.id);
        informExistingMembers(spaceId, socket.id, "member-left");
      } else {
        console.log(`No peer found for socket ID: ${socket.id}`);
      }
    });
  });
};

module.exports = { initializeMediasoupSocket };
