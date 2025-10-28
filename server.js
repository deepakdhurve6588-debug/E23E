/**
 * Facebook Messenger E2EE Auto Message Sender
 * Render-compatible (24/7) Puppeteer Bot
 */

const fs = require('fs');
const express = require('express');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000; // 60s self-ping

// Read files
const cookies = JSON.parse(fs.readFileSync('cookie.json', 'utf8'));
const threads = fs.readFileSync('Tid.txt', 'utf8').split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync('msg.txt', 'utf8').split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync('prefix.txt') ? fs.readFileSync('prefix.txt', 'utf8').trim() : '';
const delay = fs.existsSync('delay.txt') ? parseFloat(fs.readFileSync('delay.txt', 'utf8').trim()) * 1000 : 2000;
const repeats = fs.existsSync('repeats.txt') ? parseInt(fs.readFileSync('repeats.txt', 'utf8').trim(), 10) : null;

const BASE_URL = "https://www.facebook.com/messages/e2ee/t/";

const app = express();
app.get("/", (req, res) => res.send("✅ FB Sender Bot Running"));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.listen(PORT, () => console.log(`Server running on PORT ${PORT}`));

setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, KEEPALIVE_INTERVAL);

async function sendMessages() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('https://facebook.com', { waitUntil: 'networkidle2' });
  for (const c of cookies) {
    await page.setCookie(c);
  }
  await page.reload({ waitUntil: 'networkidle2' });

  console.log(`[LOGIN] Cookies set successfully`);

  for (const tid of threads) {
    let cycle = 0;
    while (repeats === null || cycle < repeats) {
      cycle++;
      console.log(`[THREAD] Opening ${tid} (Cycle ${cycle})`);
      await page.goto(`${BASE_URL}${tid}`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(3000);

      const input = await page.$('div[contenteditable="true"]');
      if (!input) {
        console.log(`[WARN] Message box not found for thread ${tid}`);
        continue;
      }

      for (const msg of messages) {
        const fullMsg = prefix + msg;
        await input.focus();
        await page.keyboard.type(fullMsg, { delay: 30 });
        await page.keyboard.press('Enter');
        console.log(`[SENT] ${fullMsg}`);
        await page.waitForTimeout(delay);
      }

      console.log(`[LOOP] Messages finished for ${tid}, restarting...`);
    }
  }

  await browser.close();
}

sendMessages().catch(console.error);
