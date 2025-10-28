import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000;

// Load config files
const cookies = JSON.parse(fs.readFileSync("cookie.json", "utf8"));
const threads = fs.readFileSync("Tid.txt", "utf8").split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync("msg.txt", "utf8").split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync("prefix.txt") ? fs.readFileSync("prefix.txt", "utf8").trim() : "";
const delay = fs.existsSync("delay.txt") ? parseFloat(fs.readFileSync("delay.txt", "utf8").trim()) * 1000 : 3000;

const BASE_URL = "https://www.facebook.com/messages/e2ee/t/";

app.get("/", (req, res) => res.send("✅ FB Cookie Bot Running"));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));

// Auto ping every minute
setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, KEEPALIVE_INTERVAL);

// Sleep helper
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Safer navigation retry
async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (err) {
    console.log(`⚠️ Navigation error: ${err.message}. Retrying...`);
    await sleep(3000);
    await safeGoto(page, url);
  }
}

async function startBot() {
  console.log("🚀 Launching Puppeteer...");

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  console.log("🌐 Opening Facebook...");
  await safeGoto(page, "https://facebook.com");

  for (const c of cookies) await page.setCookie(c);
  console.log("🍪 Cookies loaded, refreshing...");
  await safeGoto(page, "https://facebook.com");
  await sleep(5000);

  // Send loop
  for (const tid of threads) {
    while (true) {
      console.log(`💬 Opening thread ${tid}`);
      await safeGoto(page, `${BASE_URL}${tid}`);
      await sleep(4000);

      const input = await page.$('div[contenteditable="true"]');
      if (!input) {
        console.log(`⚠️ Message input not found for thread ${tid}`);
        await sleep(5000);
        continue;
      }

      for (const msg of messages) {
        const text = prefix + msg;
        await input.focus();
        await page.keyboard.type(text, { delay: 40 });
        await page.keyboard.press("Enter");
        console.log(`📨 Sent: ${text}`);
        await sleep(delay);
      }

      console.log(`🔁 All messages done for ${tid}. Repeating cycle...`);
      await sleep(3000); // short pause before restarting message loop
    }
  }
}

startBot().catch(err => console.error("❌ Bot crashed:", err));
