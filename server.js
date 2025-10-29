// fast_e2ee_sender_no_fallback.js
// CommonJS: node fast_e2ee_sender_no_fallback.js
// Dependencies: puppeteer-core, @sparticuz/chromium, node-fetch, express

const fs = require('fs');
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
setInterval(() => {
  // adjust to your external URL if needed on Render
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, KEEPALIVE_INTERVAL_MS);

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

/**
 * Fast insert + send for E2EE editors.
 * Tries known contenteditable selectors on page and frames.
 * Returns true on success.
 */
async function fastInsertAndSend(page, text) {
  const candidateSelectors = [
    'div[aria-label="Message"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-lexical-text="true"]',
    'div[contenteditable="true"]:not([aria-hidden="true"])'
  ];

  async function tryInContext(context) {
    for (const sel of candidateSelectors) {
      try {
        const el = await context.$(sel);
        if (!el) continue;

        const ok = await context.evaluate((element, message) => {
          try {
            element.focus();
            if (document.execCommand) {
              document.execCommand('insertText', false, message);
            } else {
              element.textContent = message;
              element.dispatchEvent(new Event('input', { bubbles: true }));
            }
            element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            return true;
          } catch (e) {
            return false;
          }
        }, el, text);

        if (ok) {
          await context.keyboard.press('Enter');
          return true;
        }
      } catch (e) {
        // ignore and continue
      }
    }
    return false;
  }

  if (await tryInContext(page)) return true;

  const frames = page.frames();
  for (const f of frames) {
    if (await tryInContext(f)) return true;
  }
  return false;
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
  await sleep(4000);

  // process threads (E2EE only — NO fallback)
  for (const tid of THREADS) {
    console.log('--- THREAD:', tid, '---');
    let attempts = 0;
    while (true) {
      try {
        // warm up messenger
        await safeGoto(page, 'https://www.facebook.com/messages');
        await sleep(1500);

        // OPEN E2EE THREAD ONLY
        await safeGoto(page, `https://www.facebook.com/messages/e2ee/t/${tid}`);
        await sleep(1200);

        // Send each message quickly — NO non-E2EE fallback
        for (const raw of MESSAGES) {
          const msg = (PREFIX ? PREFIX + ' ' : '') + raw;
          const sent = await fastInsertAndSend(page, msg);
          if (!sent) {
            throw new Error('message_send_failed_e2ee_only');
          }
          await sleep(Math.max(Number(MIN_DELAY_MS) || MIN_DELAY_MS, 50));
        }

        console.log(`All messages for ${tid} sent.`);
        break; // move to next thread
      } catch (err) {
        attempts++;
        console.warn('Thread send error:', err.message, `attempt ${attempts}`);
        if (err.message && err.message.includes('detached')) {
          console.log('Page/frame detached, recreating tab...');
          try {
            page = await browser.newPage();
            for (const c of cookies) await page.setCookie(c);
          } catch (e) { console.warn('Recreate tab failed', e.message); }
        }
        if (attempts >= 4) {
          console.warn('Skipping thread after repeated failures:', tid);
          break;
        }
        await sleep(2000 + attempts * 2000);
      }
    } // end while per thread
  } // end for threads

  console.log('All threads processed. Keeping browser open for inspection.');
  // browser left open intentionally
})();
