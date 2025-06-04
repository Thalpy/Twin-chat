const puppeteer = require("puppeteer");
const readline = require("readline");
const io = require("socket.io-client");

// Setup command line prompt
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function extractVideoId(url) {
  const match = url.match(/(?:v=|\/live\/|\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

rl.question("🎥 Paste your YouTube live stream URL: ", async (url) => {
  const VIDEO_ID = extractVideoId(url);
  if (!VIDEO_ID) {
    console.error(
      "❌ Invalid YouTube URL. Expected a link like https://www.youtube.com/watch?v=XXXX"
    );
    process.exit(1);
  }

  const CHAT_URL = `https://www.youtube.com/live_chat?is_popout=1&v=${VIDEO_ID}`;
  const SERVER_URL = "http://localhost:3000";
  const seenMessages = new Set();

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    for (let i = 0; i < msg.args().length; ++i) {
      msg
        .args()
        [i].jsonValue()
        .then((val) => {
          console.log(`[BrowserLog]`, val);
        });
    }
  });
  
  await page.goto(CHAT_URL);

  const socket = io(SERVER_URL);

  await page.exposeFunction("onNewChatMessage", (msg) => {
    const id = msg.id;
    if (!seenMessages.has(id)) {
      seenMessages.add(id);
      console.log(`[YouTube] ${msg.author}: ${msg.text}`);
      socket.emit("youtube_chat", {
        user: msg.author,
        text: msg.text,
      });
    }
  });

  await page.evaluate(async () => {
    const seen = new Set();

    function scanMessages() {
      const messages = document.querySelectorAll(
        "yt-live-chat-text-message-renderer"
      );
      console.log("🧪 Scanning for new messages");
      for (let msg of messages) {
        const id = msg.getAttribute("id");
        if (id && !seen.has(id)) {
          seen.add(id);
          const author = msg.querySelector("#author-name")?.innerText;
          const text = msg.querySelector("#message")?.innerText;
          if (author && text) {
            window.onNewChatMessage({ id, author, text });
            console.log(`[DEBUG] ${author}: ${text}`);
          }
        }
      }
    }

    // ✅ Wait until the item-scroller is available
    function waitForElement(selector, timeout = 10000) {
      return new Promise((resolve, reject) => {
        const interval = 100;
        const maxTries = timeout / interval;
        let tries = 0;
        const check = () => {
          const el = document.querySelector(selector);
          if (el) return resolve(el);
          if (++tries > maxTries)
            return reject("Element not found: " + selector);
          setTimeout(check, interval);
        };
        check();
      });
    }

    try {
      const chatContainer = await waitForElement("#item-scroller");
      const observer = new MutationObserver(scanMessages);
      observer.observe(chatContainer, {
        childList: true,
        subtree: true,
      });

      // Do an initial scan
      scanMessages();
    } catch (err) {
      console.error("❌ Failed to attach observer:", err);
    }
  });
  
  
  

  console.log(`✅ Connected to YouTube chat for video ${VIDEO_ID}`);
});
