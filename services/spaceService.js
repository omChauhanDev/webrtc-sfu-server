const { mediaCodecs } = require("../config/mediaCodecs");

const createSpace = async (worker, spaces, spaceId, socketId) => {
  try {
    let router1;
    let peers = [];
    console.log('In Create Space event : spaceId', spaceId);
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
  } catch (error) {
    console.error("Error creating space:", error);
    throw error;
  }
};

module.exports = { createSpace };
