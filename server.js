import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60 * 1000;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  try {
    let el = await page.$('div[contenteditable="true"]');
    if (el) return el;

    const frames = page.frames();
    for (const f of frames) {
      el = await f.$('div[contenteditable="true"]');
      if (el) return el;
    }
    return null;
  } catch {
    return null;
  }
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
          console.log("⚠️ Input not found, reloading page...");
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(4000);
          input = await findMessageBox(page);
          if (!input) {
            console.log("❌ Still no input, skipping thread temporarily.");
            continue;
          }
        }

        for (const msg of messages) {
          const text = prefix + msg;
          await input.focus();
          await page.keyboard.type(text, { delay: 35 });
          await page.keyboard.press("Enter");
          console.log(`📨 Sent: ${text}`);
          await sleep(delay);
        }

        console.log(`🔁 Finished messages for ${tid}. Looping again...`);
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
