import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000;

// ================== FILES ==================
const cookies = JSON.parse(fs.readFileSync("cookie.json", "utf8"));
const threads = fs.readFileSync("Tid.txt", "utf8").split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync("msg.txt", "utf8").split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync("prefix.txt") ? fs.readFileSync("prefix.txt", "utf8").trim() : "";
const delay = fs.existsSync("delay.txt") ? parseFloat(fs.readFileSync("delay.txt", "utf8").trim()) * 1000 : 3000;

// ================== EXPRESS KEEPALIVE ==================
app.get("/", (_, res) => res.send("✅ FB Cookie Bot Running"));
app.get("/health", (_, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
setInterval(() => fetch(`http://localhost:${PORT}/health`).catch(() => {}), KEEPALIVE_INTERVAL);

// ================== HELPERS ==================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`🌐 Navigating to ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      await Promise.race([
        page.waitForSelector('div[aria-label="Message"], div[aria-label="Chats"], div[role="main"]', { timeout: 25000 }),
        page.waitForFunction(() => document.readyState === "complete", { timeout: 25000 }),
      ]);

      console.log("✅ Page loaded successfully!");
      return;
    } catch (err) {
      if (err.message.includes("detached")) throw new Error("page_detached");
      console.log(`⚠️ Navigation error: ${err.message}. Retrying in 5s...`);
      await sleep(5000);
    }
  }
  throw new Error("navigation_failed");
}

async function findMessageBox(page) {
  const selectors = [
    'div[aria-label="Message"][contenteditable="true"]',
    'div[aria-label="Aa"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-lexical-text="true"]',
    'div[contenteditable="true"]:not([aria-hidden="true"])'
  ];

  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) return el;
    } catch {}
  }

  // Check inside iframes too
  for (const frame of page.frames()) {
    for (const sel of selectors) {
      try {
        const el = await frame.$(sel);
        if (el) return el;
      } catch {}
    }
  }

  return null;
}

// ================== MAIN BOT ==================
async function startBot() {
  console.log("🚀 Launching Chromium...");
  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--disable-extensions",
      "--window-size=1280,800"
    ],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  let page = await browser.newPage();

  // Load cookies before visiting Facebook
  await safeGoto(page, "https://facebook.com");
  for (const c of cookies) await page.setCookie(c);
  console.log("🍪 Cookies applied, refreshing...");
  await safeGoto(page, "https://facebook.com");
  await sleep(4000);

  for (const tid of threads) {
    let retry = 0;

    while (retry < 3) {
      try {
        console.log(`💬 Opening thread ${tid}`);
        await safeGoto(page, `https://www.facebook.com/messages/e2ee/t/${tid}`);
        await sleep(6000);

        let input = await findMessageBox(page);
        if (!input) {
          console.log("⚠️ E2EE message box not found, trying normal chat URL...");
          await safeGoto(page, `https://www.facebook.com/messages/t/${tid}`);
          await sleep(6000);
          input = await findMessageBox(page);
          if (!input) throw new Error("input_not_found");
        }

        // Send all messages
        for (const msg of messages) {
          const text = prefix + msg;
          input = await findMessageBox(page);
          if (!input) throw new Error("input_missing_midloop");

          await input.focus();
          await page.keyboard.type(text, { delay: 30 });
          await sleep(300);
          await page.keyboard.press("Enter");
          console.log(`📨 Sent: ${text}`);
          await sleep(delay);
        }

        console.log(`✅ Completed messages for ${tid}`);
        retry = 0;
        break; // Done for this thread

      } catch (err) {
        retry++;
        console.log(`⚠️ Error (${retry}/3): ${err.message}`);

        if (err.message.includes("page_detached") || err.message.includes("Target closed")) {
          console.log("🧩 Page detached, reopening tab...");
          try {
            page = await browser.newPage();
            for (const c of cookies) await page.setCookie(c);
          } catch (e) {
            console.log("❌ Failed to recreate page:", e.message);
          }
        }

        if (retry >= 3) {
          console.log(`⏭️ Skipping thread ${tid} after 3 failures`);
        }

        await sleep(5000);
      }
    }
  }
}

startBot().catch((e) => console.error("❌ Bot crashed:", e));
