import { Aternos } from './Aternos.js'; // TS resolves .js to .ts
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get credentials and server ID from environment variables
const aternosUsername = process.env.ATERNOS_USERNAME;
const aternosPassword = process.env.ATERNOS_PASSWORD;
const aternosServerId = process.env.ATERNOS_SERVER_ID;

if (!aternosUsername || !aternosPassword || !aternosServerId) {
  console.error(
    'Error: Missing ATERNOS_USERNAME, ATERNOS_PASSWORD, or ATERNOS_SERVER_ID environment variables.'
  );
  process.exit(1); // Exit if essential config is missing
}

(async () => {
  const server = new Aternos();
  try {
    console.log('Initializing Aternos automation...');
    await server.init();
    console.log('Initialization complete.');

    // await server.startRecording(); // Start recording (saves to ./screencast_frames by default)
    // console.log('Recording started.');

    console.log('Attempting login...');
    await server.login(aternosUsername, aternosPassword);
    console.log('Login check complete.');

    console.log(`Navigating to server page (ID: ${aternosServerId})...`);
    await server.goToServerPage(aternosServerId);
    console.log('Navigation complete.');

    console.log('Attempting to start the server...');
    await server.startServer();
    console.log('Server start process initiated and confirmed (or timed out).');

    // await server.stopRecording(); // Stop recording and save frames
    // console.log('Recording stopped and frames saved.');

    console.log('Aternos automation finished successfully.');
  } catch (error) {
    console.error('An error occurred during Aternos automation:', error);
    // Log the full error for detailed debugging
    // console.error(error);
    process.exitCode = 1; // Indicate an error occurred
  } finally {
    // Ensure stopRecording is called even if errors happened before the explicit call
    // (close() now handles calling stopRecording if needed)
    console.log('Closing browser...');
    await server.close();
    console.log('Browser closed.');
  }
})();
