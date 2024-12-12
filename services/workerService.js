const mediasoup = require("mediasoup");

const createWorker = async () => {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2100,
  });
  console.log(`Worker created with id ${worker.pid}`);

  worker.on("died", (error) => {
    console.log("Worker died");
    setTimeout(() => process.exit(1), 2000);
  });
  return worker;
};

module.exports = { createWorker };
