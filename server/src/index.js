import { MongoClient } from "mongodb";
import { Store } from "./store.js";
import { createApp } from "./app.js";
import { config } from "./config.js";

const settings = config();
const client = new MongoClient(settings.uri, {
  serverSelectionTimeoutMS: 10000,
});
let server;
try {
  await client.connect();
  const store = new Store(client.db(settings.database));
  await store.init();
  server = createApp(store, settings).listen(settings.port, settings.host, () =>
    console.log(`Masjid API listening on ${settings.host}:${settings.port}`),
  );
  server.on("error", async () => {
    console.error("Unable to start HTTP server");
    await client.close();
    process.exitCode = 1;
  });
} catch {
  console.error(
    "API startup failed. Check MongoDB connectivity and configuration.",
  );
  await client.close();
  process.exitCode = 1;
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000).unref();
  if (server) await new Promise((resolve) => server.close(resolve));
  await client.close();
  clearTimeout(timer);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
