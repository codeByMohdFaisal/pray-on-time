import express from "express";
import { MongoClient } from "mongodb";
import { Store } from "./store.js";
import { createApp } from "./application.js";
import { config } from "./config.js";

const settings = config();
const client = new MongoClient(settings.uri, {
  serverSelectionTimeoutMS: 10000,
});
let apiPromise;
async function api() {
  if (!apiPromise) apiPromise = (async () => {
    let stage = 'database connection';
    try {
      await client.connect();
      const store = new Store(client.db(settings.database));
      stage = 'database initialization';
      await store.init();
      if (settings.bootstrapAdminEmail) {
        stage = 'administrator bootstrap';
        await store.bootstrapAdmin(settings.bootstrapAdminEmail, settings.bootstrapAdminPassword);
      }
      return createApp(express, store, settings);
    } catch (error) {
      // This identifies the failing operation without logging credentials or database details.
      console.error(`API startup failed during ${stage}.`);
      throw error;
    }
  })();
  return apiPromise;
}

// This default Express export is Vercel's single serverless entry point.
const app = express();
app.disable("x-powered-by");
app.use(async (req, res, next) => {
  try { return (await api())(req, res, next); }
  catch {
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
});

if (!process.env.VERCEL) {
  let server;
  try {
    const localApi = await api();
    server = localApi.listen(settings.port, settings.host, () => console.log(`Masjid API listening on ${settings.host}:${settings.port}`));
  } catch {
    console.error("API startup failed. Check MongoDB connectivity and configuration.");
    await client.close();
    process.exitCode = 1;
  }
  async function stop() {
    if (server) await new Promise(resolve => server.close(resolve));
    await client.close();
  }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

export default app;
