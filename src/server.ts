import {  createServer, Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import colors from 'colors'; // Ensure correct import
import config from './app/config';
import createDefaultAdmin from './app/DB/createDefaultAdmin';
import { initSocketIO } from './socketIo';
import { logger } from './app/utils/logger';
import { startAutoAcceptDeliveriesCron, startCleanupOrphanedAssetsCron } from './app/modules/booking/booking.cron';
import { startDowngradeExpiredPlansCron } from './app/modules/snapperProfile/snapperProfile.cron';
import { startPurgeExpiredDeliveryAssetsCron } from './app/modules/gallery/gallery.cron';
import { startReleasePendingEarningsCron } from './app/modules/wallet/wallet.cron';

// Create a new HTTP server
const socketServer = createServer();


let server: Server;

async function main() {
  try {

    const dbStartTime = Date.now();
    const loadingFrames = ["🌍", "🌎", "🌏"]; // Loader animation frames
    let frameIndex = 0;

    // Start the connecting animation
    const loader = setInterval(() => {
      process.stdout.write(
        `\rMongoDB connecting ${loadingFrames[frameIndex]} Please wait 😢`,
      );
      frameIndex = (frameIndex + 1) % loadingFrames.length;
    }, 300); // Update frame every 300ms


    // console.log('config.database_url', config.database_url);


    // Connect to MongoDB with a timeout
    await mongoose.connect(config.database_url as string, {
      connectTimeoutMS: 10000, // 10 seconds timeout
    });

    // Stop the connecting animation
    clearInterval(loader);
    logger.info(
      `\r✅ Mongodb connected successfully in ${Date.now() - dbStartTime}ms`,
    );

    //create a defult admin
    createDefaultAdmin();

    // hourly sweep: auto-accept deliveries the customer never responded to in 7 days
    startAutoAcceptDeliveriesCron();

    // daily sweep: delete staged delivery-asset uploads that never got submitted
    startCleanupOrphanedAssetsCron();

    // daily sweep: downgrade snappers whose paid storage plan has expired back to FREE
    startDowngradeExpiredPlansCron();

    // daily sweep: purge delivery assets older than the owning snapper's retention window
    startPurgeExpiredDeliveryAssetsCron();

    // hourly sweep: release snapper earnings past their settlement hold into available balance
    startReleasePendingEarningsCron();



    // Start HTTP server
    server = createServer(app);

    server.listen(Number(config.port), () => {
      console.log(
        colors.green(`---> Photo_Op server is listening on  : http://${config.ip}:${config.port}`).bold,
      );
    // Initialize Socket.IO
    initSocketIO(socketServer);

    });
  } catch (err) {
    console.error('Error starting the server:', err);
    console.log(err);
  }
}

main();

// Graceful shutdown for unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled rejection detected: ${err}`);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
  process.exit(1); // Ensure process exits
});

// Graceful shutdown for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception detected: ${err}`);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
});

