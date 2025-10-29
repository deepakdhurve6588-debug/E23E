import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60000;

// Load configuration files
const cookies = JSON.parse(fs.readFileSync("cookie.json", "utf8"));
const threads = fs.readFileSync("Tid.txt", "utf8").split(/\r?\n/).filter(Boolean);
const messages = fs.readFileSync("msg.txt", "utf8").split(/\r?\n/).filter(Boolean);
const prefix = fs.existsSync("prefix.txt") ? fs.readFileSync("prefix.txt", "utf8").trim() : "";
const delay = fs.existsSync("delay.txt") ? parseFloat(fs.readFileSync("delay.txt", "utf8").trim()) * 1000 : 3000;

const BASE_URL = "https://www.facebook.com/messages/e2ee/t/";

app.get("/", (_, res) => res.send("✅ FB Cookie Bot Running"));
app.get("/health", (_, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
setInterval(() => fetch(`http://localhost:${PORT}/health`).catch(() => {}), KEEPALIVE_INTERVAL);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (err) {
      if (err.message.includes("detached")) throw new Error("page_detached");
      console.log(`⚠️ Navigation error: ${err.message}. Retrying in 5 seconds...`);
      await sleep(5000);
    }
  }
  throw new Error("navigation_failed");
}

// एडवांस्ड मेसेज बॉक्स खोज और React-compatible टेक्स्ट टाइपिंग
async function findMessageBox(page) {
  try {
    let el = await page.waitForSelector('div[aria-label="Message"][contenteditable="true"]', { timeout: 10000 });
    if (el) return el;

    for (const frame of page.frames()) {
      el = await frame.waitForSelector('div[aria-label="Message"][contenteditable="true"]', { timeout: 5000 }).catch(() => null);
      if (el) return el;
    }
    return null;
  } catch {
    return null;
  }
}

async function typeMessage(page, inputElement, message) {
  await page.evaluate((el, msg) => {
    let span = el.querySelector('span[data-lexical-text="true"]');
    if (!span) {
      span = document.createElement('span');
      span.setAttribute('data-lexical-text', 'true');
      el.appendChild(span);
    }
    span.textContent = msg;

    const event = new Event('input', { bubbles: true });
    el.dispatchEvent(event);
  }, inputElement, message);

  await page.keyboard.press('Enter');
}


async function startBot() {
  console.log("🚀 Launching Puppeteer...");
  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--disable-extensions"
    ],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  let page = await browser.newPage();
  await safeGoto(page, "https://facebook.com");
  for (const c of cookies) await page.setCookie(c);
  console.log("🍪 Cookies loaded, refreshing page...");
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
          console.log("⚠️ Message box not found after wait, reloading...");
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(4000);
          input = await findMessageBox(page);
          if (!input) {
            console.log("❌ Still can't find message box, skipping this thread temporarily.");
            continue;
          }
        }

        for (const msg of messages) {
          const text = prefix + msg;
          await input.focus();
          await typeMessage(page, input, text);
          console.log(`📨 Sent: ${text}`);
          await sleep(delay);
        }

        console.log(`🔁 Finished messages for ${tid}, restarting...`);
      } catch (err) {
        console.log(`⚠️ Error: ${err.message}`);
        if (err.message.includes("page_detached")) {
          console.log("🧩 Recreating page...");
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
