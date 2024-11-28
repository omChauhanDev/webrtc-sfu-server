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
        if (dtlsState === "close" || dtlsState === "failed") {
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

module.exports = { createWebRtcTransport };
