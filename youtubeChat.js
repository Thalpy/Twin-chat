const puppeteer = require("puppeteer"); // now uses full puppeteer
const readline = require("readline");
const io = require("socket.io-client");

// Setup command line prompt
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function extractVideoId(url) {
  const match = url.match(/(?:v=|\/live\/|\.be\/|v=)([a-zA-Z0-9_-]{11})/);
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

  const browser = await puppeteer.launch({
    headless: false, // Presently doesn't work headless with YouTube
    defaultViewport: null, // Use full available window
    timeout: 60000, // Increase Puppeteer launch timeout
  });

  const page = await browser.newPage();

  // Forward browser-side console logs
  page.on("console", (msg) => {
    for (let i = 0; i < msg.args().length; ++i) {
      msg
        .args()
        [i].jsonValue()
        .then((val) => {
          //console.log(`[BrowserLog]`, val);
        });
    }
  });

  await page.goto(CHAT_URL, {
    waitUntil: "networkidle2",
    timeout: 60000, // ⏱️ Increase navigation timeout
  });

  const socket = io(SERVER_URL);

  await page.exposeFunction("onNewChatMessage", (msg) => {
    const { id, author, text, avatar } = msg;
    if (!seenMessages.has(id)) {
      seenMessages.add(id);
      console.log(`[YouTube] ${author}: ${text}`);
      socket.emit("youtube_chat", {
        user: author,
        text,
        avatar,
      });
    }
  });
  

  // 🧪 Wrap page.evaluate in try/catch to avoid timeout crash
  try {
    await page.evaluate(async () => {
      const seen = new Set();

      // Check if chat is disabled
      const disabledText = document.body.innerText;
      if (disabledText.includes("Chat is disabled for this live stream")) {
        console.log("❌ Chat is disabled for this livestream.");
        window.onNewChatMessage({
          id: "disabled",
          author: "YouTube",
          text: "❌ Chat is disabled for this stream.",
        });
        return;
      }

      function scanMessages() {
        const messages = document.querySelectorAll(
          "yt-live-chat-text-message-renderer"
        );
        for (const msg of messages) {
          const id = msg.getAttribute("id");
          if (id && !seen.has(id)) {
            seen.add(id);
            const author = msg.querySelector("#author-name")?.innerText;
            const text = msg.querySelector("#message")?.innerHTML;
            const avatar = msg.querySelector("#author-photo img")?.src;

            if (author && text) {
              window.onNewChatMessage({ id, author, text, avatar });
              console.log(`[DEBUG] ${author}: ${text}`);
            }
          }
        }
      }

      // Wait until container is ready (no timeout)
      const waitForContainer = () =>
        new Promise((resolve) => {
          const check = () => {
            const container = document.querySelector(
              "yt-live-chat-item-list-renderer #contents"
            );
            if (container) return resolve(container);
            requestAnimationFrame(check);
          };
          check();
        });

      const container = await waitForContainer();
      const observer = new MutationObserver(scanMessages);
      observer.observe(container, { childList: true, subtree: true });

      scanMessages(); // initial scan
      console.log("✅ Chat observer attached and running.");
    });
  } catch (err) {
    console.error("💥 Error in page.evaluate:", err.message);
  }

  console.log(`✅ Connected to YouTube chat for video ${VIDEO_ID}`);
});
