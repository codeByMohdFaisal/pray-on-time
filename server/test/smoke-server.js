// Test fixture only: starts real ephemeral MongoDB + Express for the UI smoke.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { Store } from '../src/store.js';
import { createApp } from '../src/app.js';
process.env.MONGOMS_DISTRO ||= 'ubuntu-22.04';
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = 'true';
const mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '8.0.17' }, instance: { ip: '127.0.0.1', args: ['--nounixsocket'] } });
const client = new MongoClient(mongo.getUri()); await client.connect();
const store = new Store(client.db('azan_ui_smoke')); await store.init(); await store.seedDemo();
await store.approveVolunteer('volunteer@example.test', 'Smoke-password-123', 'sample-noor');
const server = createApp(store).listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port) + '\n'));
async function stop() { await new Promise(resolve => server.close(resolve)); await client.close(); await mongo.stop(); }
process.once('SIGTERM', stop); process.once('SIGINT', stop);
