// DOM integration smoke test for the exported React Native Web screens.
// This does NOT simulate Android alarms, native audio or background execution.
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function waitFor(fn, label, attempts = 100) {
  for (let i = 0; i < attempts; i++) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Timed out: ' + label);
}

async function run() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!e.message.includes('navigation')) errors.push(e.message); });
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const backend = spawn(process.execPath, ['server/test/smoke-server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let backendPort = '';
  backend.stdout.on('data', chunk => { backendPort += chunk.toString(); });
  const root = path.resolve('dist-web');
  const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname;
    const filename = route === '/' ? path.join(root, 'index.html') : path.join(root, route);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      res.end(fs.readFileSync(filename));
    } catch { res.writeHead(404); res.end(); }
  });
  let dom;
  try {
    await waitFor(() => /^\d+\s*$/.test(backendPort), 'backend ready', 600);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const site = `http://127.0.0.1:${server.address().port}`;
    dom = await JSDOM.fromURL(site, {
      resources: 'usable', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        w.fetch = (url, options) => {
          let target = new URL(url, w.location.href).toString();
          // Test-only transport mapping; no public service is contacted.
          target = target.replace('https://pilot.example.test', `http://127.0.0.1:${backendPort.trim()}`);
          // Node's fetch requires its own AbortSignal realm; production browsers
          // use their native fetch and AbortController together.
          return fetch(target, { ...options, signal: undefined });
        };
        w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      },
    });
    const w = dom.window;
    const d = w.document;
    const text = () => d.body.textContent;
    const click = (label, role = 'button') => {
      const target = [...d.querySelectorAll(`[role="${role}"]`)].find(el => el.textContent.trim() === label || (role === 'tab' && el.textContent.endsWith(label)));
      assert.ok(target, `Missing ${role}: ${label}`);
      target.click();
    };
    const input = (label, value) => {
      const target = d.querySelector(`[aria-label="${label}"]`);
      assert.ok(target, `Missing field: ${label}`);
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(target, value);
      target.dispatchEvent(new w.Event('input', { bubbles: true }));
      target.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    await waitFor(() => text().includes('Today’s azan times'), 'home');
    const dropdown = d.querySelector('select');
    dropdown.value = 'sample-bilal';
    dropdown.dispatchEvent(new w.Event('change', { bubbles: true }));
    await waitFor(() => text().includes('4:45 PM'), 'masjid-specific times');
    click('Settings', 'tab');
    await waitFor(() => text().includes('Pilot server'), 'settings');
    click('○  Play azan');
    await waitFor(() => text().includes('Offline alarms require the Android app build.'), 'native capability guard');
    click('Fill five test times, starting in 2 minutes');
    await new Promise(r => setTimeout(r, 50));
    click('Save test timetable on this phone');
    await waitFor(() => text().includes('Test timetable saved. Enable an alert mode before testing.'), 'local-only test timetable');
    input('API server address', 'https://pilot.example.test');
    await new Promise(r => setTimeout(r, 50));
    click('Connect server');
    await waitFor(() => text().includes('Connected. Choose your masjid'), 'connect API');
    click('Volunteer', 'tab');
    await waitFor(() => text().includes('Volunteer sign in'), 'volunteer login');
    input('Email', 'volunteer@example.test');
    input('Password', 'Smoke-password-123');
    await new Promise(r => setTimeout(r, 50));
    click('Sign in');
    await waitFor(() => text().includes('Review changes'), 'authorised editor');
    input('Asr azan · HH:MM', '16:25');
    await new Promise(r => setTimeout(r, 50));
    click('Review changes');
    await waitFor(() => text().includes('Confirm and publish timings'), 'review');
    click('Confirm and publish timings');
    await waitFor(() => text().includes('Published. Followers receive these timings'), 'published update');
    click('My masjid', 'tab');
    await waitFor(() => text().includes('4:25 PM'), 'follower sees revised time');
    assert.deepEqual(errors, []);
    console.log('PASS: screen render, masjid switch, native guard, API connection, volunteer login, review/publish, revised follower timings.');
  } catch (error) {
    console.error('Screen at failure:', dom?.window.document.body.textContent);
    console.error('Runtime errors:', errors);
    throw error;
  } finally {
    dom?.window.close();
    server.close();
    backend.kill();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
