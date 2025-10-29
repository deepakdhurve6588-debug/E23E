// fast_e2ee_sender_debug.js
// CommonJS — run: node fast_e2ee_sender_debug.js
// deps: puppeteer-core, @sparticuz/chromium, node-fetch, express, fs-extra (optional)

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL_MS = 60 * 1000;

app.get('/', (req, res) => res.send('OK'));
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.listen(PORT, () => console.log(`Health server on :${PORT}`));
setInterval(() => fetch(`http://localhost:${PORT}/health`).catch(() => {}), KEEPALIVE_INTERVAL_MS);

// --------- Config & files ----------
const COOKIES_FILE = fs.existsSync('cookies.json') ? 'cookies.json' : 'cookie.json';
if (!fs.existsSync(COOKIES_FILE)) {
  console.error('Missing cookie file (cookies.json or cookie.json). Exiting.');
  process.exit(1);
}
const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));

function readLines(fname) {
  if (!fs.existsSync(fname)) return [];
  return fs.readFileSync(fname, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
const THREADS = readLines('Tid.txt');
const MESSAGES = readLines('msg.txt');
const PREFIX = readLines('prefix.txt')[0] || '';
const MIN_DELAY_MS = (fs.existsSync('delay.txt') ? parseInt(readLines('delay.txt')[0], 10) : 500); // default 500ms

if (THREADS.length === 0) { console.error('Tid.txt empty'); process.exit(1); }
if (MESSAGES.length === 0) { console.error('msg.txt empty'); process.exit(1); }

// ensure screenshots folder
const SS_DIR = path.resolve('./screenshots');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

// --------- Helpers ----------
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      console.log('Navigating to', url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await Promise.race([
        page.waitForSelector('div[aria-label="Chats"], div[aria-label="Message"], div[role="main"]', { timeout: 20000 }),
        page.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 })
      ]);
      return;
    } catch (err) {
      console.warn('safeGoto navigation error:', err.message);
      if (err.message && err.message.includes('detached')) {
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); return; } catch(e){/*fallback*/}
      }
      await sleep(5000);
    }
  }
  throw new Error('navigation_failed');
}

// Find element handle (page or frames) - returns {context, handle, selectorUsed}
async function locateEditable(page) {
  const selectors = [
    'div[aria-label="Message"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-lexical-text="true"]',
    'div[contenteditable="true"]:not([aria-hidden="true"])'
  ];

  // try page
  for (const sel of selectors) {
    try {
      const handle = await page.$(sel);
      if (handle) return { context: page, handle, selector: sel };
    } catch {}
  }

  // try frames
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      try {
        const handle = await frame.$(sel);
        if (handle) return { context: frame, handle, selector: sel };
      } catch {}
    }
  }
  return null;
}

// Send method 1: document.execCommand('insertText')
// returns true if success
async function methodExecInsert(context, handle, text) {
  try {
    const ok = await context.evaluate((el, msg) => {
      try {
        el.focus();
        if (document.execCommand) {
          document.execCommand('insertText', false, msg);
        } else {
          el.textContent = msg;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        return true;
      } catch (e) {
        return false;
      }
    }, handle, text);
    if (ok) {
      await context.keyboard.press('Enter');
      return true;
    }
  } catch (e) {}
  return false;
}

// Send method 2: set innerText + dispatch input & keypress
async function methodSetInner(context, handle, text) {
  try {
    const ok = await context.evaluate((el, msg) => {
      try {
        el.focus();
        // Set via innerText or textContent depending on node
        if ('innerText' in el) el.innerText = msg;
        else el.textContent = msg;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('keyup', { bubbles: true }));
        return true;
      } catch (e) {
        return false;
      }
    }, handle, text);
    if (ok) {
      await context.keyboard.press('Enter');
      return true;
    }
  } catch (e) {}
  return false;
}

// Send method 3: keyboard.type (slowest fallback)
async function methodKeyboardType(context, handle, text) {
  try {
    await handle.focus();
    await context.keyboard.type(text, { delay: 20 });
    await context.keyboard.press('Enter');
    return true;
  } catch (e) {}
  return false;
}

async function fastInsertAndSendWithDiagnostics(page, text, threadId, msgIndex) {
  // locate fresh handle each time
  const found = await locateEditable(page);
  if (!found) {
    console.log('No editable element found (locateEditable returned null).');
    return { ok: false, reason: 'no_input' };
  }

  const { context, handle, selector } = found;
  console.log(`Found input using selector: ${selector} (context=${context.url ? 'page' : 'frame'})`);

  // Try methods in order
  const methods = [
    { fn: methodExecInsert, name: 'execInsert' },
    { fn: methodSetInner, name: 'setInner' },
    { fn: methodKeyboardType, name: 'keyboardType' },
  ];

  for (const m of methods) {
    try {
      const start = Date.now();
      const ok = await m.fn(context, handle, text);
      const took = Date.now() - start;
      console.log(`Tried ${m.name} — success=${ok} (took ${took}ms)`);
      if (ok) return { ok: true, method: m.name };
    } catch (e) {
      console.log(`Method ${m.name} threw:`, e.message || e);
    }
  }

  // If none succeeded — screenshot for debugging
  const ssPath = path.join(SS_DIR, `fail_${threadId}_msg${msgIndex}_${Date.now()}.png`);
  try {
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log('Saved screenshot to', ssPath);
  } catch (e) { console.warn('Screenshot failed:', e.message); }

  return { ok: false, reason: 'all_methods_failed' };
}

// --------- Main -------
(async () => {
  console.log('Launching Chromium via @sparticuz/chromium...');
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: null,
  });

  let page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(120000);

  // load cookies
  await safeGoto(page, 'https://facebook.com');
  for (const c of cookies) {
    try {
      const cookie = Object.assign({}, c);
      if (cookie.domain && !cookie.domain.startsWith('.')) cookie.domain = cookie.domain.startsWith('www.') ? cookie.domain.replace('www.', '.') : '.' + cookie.domain;
      await page.setCookie(cookie);
    } catch (e) { /* ignore */ }
  }
  console.log('Cookies set; refreshing session...');
  await safeGoto(page, 'https://facebook.com');
  await sleep(3000);

  for (const tid of THREADS) {
    console.log('--- THREAD:', tid, '---');
    let attempts = 0;
    while (true) {
      try {
        await safeGoto(page, `https://www.facebook.com/messages/e2ee/t/${tid}`);
        await sleep(1200);

        // send each message
        for (let i = 0; i < MESSAGES.length; i++) {
          const raw = MESSAGES[i];
          const msg = (PREFIX ? (PREFIX + ' ' + raw) : raw);
          console.log(`Sending to ${tid} message[${i}]: ${msg.slice(0,120)}`);
          const res = await fastInsertAndSendWithDiagnostics(page, msg, tid, i);
          if (!res.ok) throw new Error(`send_failed:${res.reason}`);
          // small delay
          await sleep(Math.max(MIN_DELAY_MS, 100));
        }

        console.log(`All messages for ${tid} sent.`);
        break;
      } catch (err) {
        attempts++;
        console.warn('Thread send error:', err.message, `attempt ${attempts}`);
        if (err.message && err.message.includes('detached')) {
          console.log('Page/frame detached, recreating page...');
          try {
            page = await browser.newPage();
            for (const c of cookies) await page.setCookie(c);
          } catch (e) { console.warn('Recreate page failed', e.message); }
        }
        if (attempts >= 4) {
          console.warn('Skipping thread after repeated failures:', tid);
          break;
        }
        await sleep(2000 + attempts * 2000);
      }
    } // end while per thread
  } // end for threads

  console.log('Done. Browser left open for inspection.');
})();
