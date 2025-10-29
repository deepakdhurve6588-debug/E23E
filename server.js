import fs from "fs";
import express from "express";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 10000;
const KEEPALIVE_INTERVAL = 60000;

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

// बेहतर मेसेज बॉक्स खोजने वाला फंक्शन
async function findMessageBox(page) {
  try {
    // प्राथमिक प्रयास: मुख्य पेज पर इंतजार और चयन
    let el = await page.waitForSelector('div[contenteditable="true"]', { timeout: 10000 });
    if (el) return el;

    // अगर मुख्य पेज में न मिले तो फ्रेम्स में खोजें
    for (const frame of page.frames()) {
      el = await frame.waitForSelector('div[contenteditable="true"]', { timeout: 5000 }).catch(() => null);
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
          await page.keyboard.type(text, { delay: 35 });
          await page.keyboard.press("Enter");
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
