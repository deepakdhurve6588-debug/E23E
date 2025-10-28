import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000; // 1 minute

// Load files
const cookies = JSON.parse(fs.readFileSync("cookie.json", "utf8"));
const threads = fs.readFileSync("Tid.txt", "utf8").split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync("msg.txt", "utf8").split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync("prefix.txt") ? fs.readFileSync("prefix.txt", "utf8").trim() : "";
const delay = fs.existsSync("delay.txt") ? parseFloat(fs.readFileSync("delay.txt", "utf8").trim()) * 1000 : 2000;

const BASE_URL = "https://www.facebook.com/messages/e2ee/t/";

app.get("/", (req, res) => res.send("✅ FB Cookie Bot is Running"));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Keepalive ping (Render auto sleep रोकने के लिए)
setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, KEEPALIVE_INTERVAL);

async function startBot() {
  console.log("🚀 Launching Puppeteer with Chromium...");

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true
  });

  const page = await browser.newPage();

  // Load cookies for Facebook
  await page.goto("https://facebook.com", { waitUntil: "networkidle2" });
  for (const c of cookies) {
    await page.setCookie(c);
  }
  await page.reload({ waitUntil: "networkidle2" });
  console.log("✅ Logged in using cookies.");

  // Loop through thread IDs
  while (true) {
    for (const tid of threads) {
      console.log(`💬 Opening thread: ${tid}`);
      await page.goto(`${BASE_URL}${tid}`, { waitUntil: "networkidle2" });
      await page.waitForTimeout(4000);

      const input = await page.$('div[contenteditable="true"]');
      if (!input) {
        console.log(`[⚠️] Message box not found for ${tid}`);
        continue;
      }

      for (const msg of messages) {
        const text = prefix + msg;
        await input.focus();
        await page.keyboard.type(text, { delay: 50 });
        await page.keyboard.press("Enter");
        console.log(`📤 Sent: ${text}`);
        await page.waitForTimeout(delay);
      }

      console.log(`🔁 Completed all messages for ${tid}, repeating...`);
    }
  }
}

startBot().catch((err) => console.error("❌ Error:", err));
