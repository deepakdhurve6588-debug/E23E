import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000;

// ========== FILE READING ==========
const cookies = JSON.parse(fs.readFileSync("cookie.json", "utf8"));
const threads = fs.readFileSync("Tid.txt", "utf8").split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync("msg.txt", "utf8").split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync("prefix.txt") ? fs.readFileSync("prefix.txt", "utf8").trim() : "";
const delay = fs.existsSync("delay.txt")
  ? parseFloat(fs.readFileSync("delay.txt", "utf8").trim()) * 1000
  : 3000;

const BASE_URL = "https://www.facebook.com/messages/e2ee/t/";

app.get("/", (_, res) => res.send("✅ FB Cookie Bot Running"));
app.get("/health", (_, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));

// External keepalive ping (use your Render URL)
setInterval(() => fetch("https://your-render-app-name.onrender.com/health").catch(() => {}), KEEPALIVE_INTERVAL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ========== SAFE PAGE NAVIGATION ==========
async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
      return;
    } catch (err) {
      console.log(`⚠️ Navigation error: ${err.message}. Retrying in 5s...`);
      await sleep(5000);
    }
  }
  throw new Error("navigation_failed");
}

// ========== ADVANCED MESSAGE BOX DETECTION ==========
async function findMessageBox(page) {
  const selectors = [
    'div[aria-label="Message"]',
    'div[aria-label="Aa"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-lexical-text="true"]',
    'div[contenteditable="true"]:not([aria-hidden="true"])',
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        console.log(`✅ Message box found via selector: ${sel}`);
        return el;
      }
    } catch {}
  }

  // check all frames too (Messenger may inject iframe)
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      try {
        const el = await frame.$(sel);
        if (el) {
          console.log(`✅ Message box found in frame via selector: ${sel}`);
          return el;
        }
      } catch {}
    }
  }

  console.log("⚠️ Message box not found.");
  return null;
}

// ========== MAIN BOT FUNCTION ==========
async function startBot() {
  console.log("🚀 Launching Puppeteer...");
  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--disable-extensions",
    ],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  let page = await browser.newPage();
  await safeGoto(page, "https://facebook.com");
  for (const c of cookies) await page.setCookie(c);
  console.log("🍪 Cookies loaded, refreshing...");
  await safeGoto(page, "https://facebook.com");
  await sleep(4000);

  for (const tid of threads) {
    while (true) {
      try {
        console.log(`💬 Opening thread ${tid}`);
        await safeGoto(page, `${BASE_URL}${tid}`);
        await sleep(5000);

        let input = await findMessageBox(page);
        if (!input) {
          console.log("⚠️ Input not found, reloading...");
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(4000);
          input = await findMessageBox(page);
          if (!input) {
            console.log("❌ Still no input, skipping thread temporarily.");
            continue;
          }
        }

        for (const msg of messages) {
          const text = prefix ? `${prefix} ${msg}` : msg;
          await input.focus();
          await page.keyboard.type(text, { delay: 25 });
          await page.keyboard.press("Enter");
          console.log(`📨 Sent: ${text}`);
          await sleep(delay);
        }

        console.log(`🔁 Completed all messages for ${tid}, repeating...`);
      } catch (err) {
        console.log(`⚠️ Error: ${err.message}`);
        if (err.message.includes("page_detached")) {
          console.log("🧩 Recreating new tab...");
          try {
            page = await browser.newPage();
            for (const c of cookies) await page.setCookie(c);
          } catch (e) {
            console.log("❌ Failed to recreate page:", e.message);
          }
        }
        await sleep(5000);
      }
    }
  }
}

startBot().catch((e) => console.error("❌ Bot crashed:", e));
