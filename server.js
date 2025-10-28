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

app.get("/", (req, res) => res.send("✅ FB Cookie Bot Running"));
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));

setInterval(() => {
  fetch(`http://localhost:${PORT}/health`).catch(() => {});
}, KEEPALIVE_INTERVAL);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  } catch (err) {
    console.log(`⚠️ Navigation error: ${err.message}. Retrying in 5s...`);
    await sleep(5000);
    await safeGoto(page, url);
  }
}

async function findMessageBox(page) {
  try {
    // Try normal selector first
    let el = await page.$('div[contenteditable="true"]');
    if (el) return el;

    // Try inside iframe if E2EE uses one
    const frames = page.frames();
    for (const frame of frames) {
      el = await frame.$('div[contenteditable="true"]');
      if (el) return el;
    }

    // Try shadow DOM search
    const handle = await page.evaluateHandle(() => {
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.shadowRoot) {
          const inner = node.shadowRoot.querySelector('div[contenteditable="true"]');
          if (inner) return inner;
        }
      }
      return null;
    });
    if (handle) return handle.asElement();

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

  for (const tid of threads) {
    while (true) {
      try {
        console.log(`💬 Opening thread ${tid}`);
        await safeGoto(page, `${BASE_URL}${tid}`);
        await sleep(7000);

        let input = await findMessageBox(page);
        if (!input) {
          console.log(`⚠️ Message input not found, retrying after refresh...`);
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(7000);
          input = await findMessageBox(page);
          if (!input) {
            console.log(`❌ Still no message box, skipping thread temporarily...`);
            continue;
          }
        }

        for (const msg of messages) {
          const text = prefix + msg;
          await input.focus();
          await page.keyboard.type(text, { delay: 30 });
          await page.keyboard.press("Enter");
          console.log(`📨 Sent: ${text}`);
          await sleep(delay);
        }

        console.log(`🔁 Completed cycle for thread ${tid}. Repeating...`);
        await sleep(4000);
      } catch (err) {
        console.log(`⚠️ Error in thread ${tid}: ${err.message}`);
        await sleep(5000);
      }
    }
  }
}

startBot().catch(err => console.error("❌ Bot crashed:", err));
