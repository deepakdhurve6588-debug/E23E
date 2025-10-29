import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000;

// --- Load files ---
const cookies = JSON.parse(fs.readFileSync("cookie.json", "utf8"));
const threads = fs.readFileSync("Tid.txt", "utf8").split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync("msg.txt", "utf8").split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync("prefix.txt") ? fs.readFileSync("prefix.txt", "utf8").trim() : "";
const delay = fs.existsSync("delay.txt") ? parseFloat(fs.readFileSync("delay.txt", "utf8").trim()) * 1000 : 4000;

const BASE_URL = "https://www.facebook.com/messages/e2ee/t/";

// --- Server & keepalive ---
app.get("/", (_, res) => res.send("✅ FB Cookie Bot Running"));
app.get("/health", (_, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
setInterval(() => fetch(`http://localhost:${PORT}/health`).catch(() => {}), KEEPALIVE_INTERVAL);

// --- Utility ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Safe navigation with retry ---
async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`🌐 Navigating to ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Wait for Messenger UI or ready state
      const loaded = await Promise.race([
        page.waitForSelector('div[aria-label="Chats"], div[aria-label="Message"], div[role="main"]', { timeout: 20000 }),
        page.waitForFunction(() => document.readyState === "complete", { timeout: 20000 }),
      ]);

      if (loaded) {
        console.log("✅ Page loaded successfully!");
        return;
      }
    } catch (err) {
      console.log(`⚠️ Navigation error: ${err.message}. Retrying in 5s...`);
      await sleep(5000);
    }
  }
  console.log("❌ Page failed to load after 3 tries, skipping...");
  throw new Error("navigation_failed");
}

// --- Better message box finder ---
async function findMessageBox(page) {
  try {
    const selectors = [
      'div[aria-label="Message"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ];

    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) return el;
    }

    // search inside frames if needed
    for (const frame of page.frames()) {
      for (const sel of selectors) {
        const el = await frame.$(sel);
        if (el) return el;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// --- Main bot logic ---
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

  // Load cookies
  await safeGoto(page, "https://facebook.com");
  for (const c of cookies) await page.setCookie(c);
  console.log("🍪 Cookies loaded, refreshing...");
  await safeGoto(page, "https://facebook.com");
  await sleep(4000);

  for (const tid of threads) {
    let failCount = 0;

    while (failCount < 3) {
      try {
        console.log(`💬 Opening thread ${tid}`);
        await safeGoto(page, "https://www.facebook.com/messages");
        await sleep(3000);
        await safeGoto(page, `${BASE_URL}${tid}`);
        await sleep(5000);

        let input = await findMessageBox(page);
        if (!input) {
          console.log("⚠️ Message input not found, reloading...");
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(4000);
          input = await findMessageBox(page);
          if (!input) throw new Error("input_not_found");
        }

        // Send all messages from msg.txt
        for (const msg of messages) {
          const text = prefix + msg;
          await input.focus();
          await page.keyboard.type(text, { delay: 35 });
          await page.keyboard.press("Enter");
          console.log(`📨 Sent: ${text}`);
          await sleep(delay);
        }

        console.log(`✅ Finished messages for ${tid}. Looping again...`);
        failCount = 0; // reset on success
      } catch (err) {
        console.log(`⚠️ Error: ${err.message}`);
        failCount++;
        if (err.message.includes("page_detached") || err.message.includes("Target closed")) {
          console.log("🧩 Recreating new tab...");
          try {
            page = await browser.newPage();
            for (const c of cookies) await page.setCookie(c);
          } catch (e) {
            console.log("❌ Failed to recreate page:", e.message);
          }
        }
        if (failCount >= 3) {
          console.log(`⏭️ Skipping thread ${tid} after 3 failures`);
          break;
        }
        await sleep(5000);
      }
    }
  }
}

startBot().catch((e) => console.error("❌ Bot crashed:", e));
