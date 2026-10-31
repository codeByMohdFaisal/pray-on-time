import { MongoClient } from 'mongodb';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Store } from './store.js';
import { config } from './config.js';

// Administrative operations are CLI-only; there is no self-approval HTTP route.
const [command, ...args] = process.argv.slice(2);
if (!['seed-demo', 'add-masjid', 'approve-volunteer'].includes(command)) {
  console.log('Commands:\n seed-demo\n add-masjid ID "Name" "Area" [Timezone]\n approve-volunteer EMAIL MASJID_ID');
  process.exit(1);
}
const settings = config();
const client = new MongoClient(settings.uri, { serverSelectionTimeoutMS: 10000 });
async function password() {
  if (!stdin.isTTY) throw new Error('Run the approval command in an interactive terminal');
  stdout.write('New password (hidden, 12+ characters): ');
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === '\u0003') { finish(); reject(new Error('Cancelled')); return; }
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    }
    stdin.on('data', onData);
  });
}
try {
  await client.connect();
  const store = new Store(client.db(settings.database)); await store.init();
  if (command === 'seed-demo') { await store.seedDemo(); console.log('Sample masjids added. No volunteer accounts were created.'); }
  if (command === 'add-masjid') { await store.addMasjid(args[0], args[1], args[2], args[3]); console.log('Masjid added without a timetable.'); }
  if (command === 'approve-volunteer') {
    const prompt = createInterface({ input: stdin, output: stdout });
    const confirmation = await prompt.question(`Approve ${args[0]} to manage ${args[1]}? Type APPROVE: `); prompt.close();
    if (confirmation !== 'APPROVE') throw new Error('Cancelled');
    const secret = await password();
    await store.approveVolunteer(args[0], secret, args[1]); console.log('Volunteer approved; previous sessions revoked.');
  }
} catch (error) {
  // Do not print raw MongoDB errors, which can contain server or URI details.
  console.error(error.name === 'Problem' || ['Cancelled', 'Run the approval command in an interactive terminal'].includes(error.message) ? error.message : 'Admin operation failed. Check arguments and MongoDB configuration.');
  process.exitCode = 1;
} finally { await client.close(); }
