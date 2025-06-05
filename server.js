require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tmi = require("tmi.js");
const path = require("path");
const fs = require("fs");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));


const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public"
app.use(express.static("public"));

// Twitch credentials
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TWITCH_OAUTH = process.env.TWITCH_OAUTH;

// Confirm notify.mp3 is in the public folder
const notifyPath = path.join(__dirname, "public", "notify.mp3");
if (!fs.existsSync(notifyPath)) {
  console.error("❌ ERROR: notify.mp3 not found in /public");
  process.exit(1);
}

// Avatar cache
const twitchAvatars = new Map();

async function getTwitchAvatar(userLogin) {
  if (twitchAvatars.has(userLogin)) return twitchAvatars.get(userLogin);
  try {
    const res = await fetch(
      `https://api.ivr.fi/v2/twitch/user?login=${userLogin}`
    );
    const data = await res.json();
    const avatar = data[0]?.logo || null;
    if (avatar) twitchAvatars.set(userLogin, avatar);
    return avatar;
  } catch {
    return null;
  }
}

// HTML-safe text
function sanitizeText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Twitch client
const twitchClient = new tmi.Client({
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH,
  },
  channels: [TWITCH_CHANNEL],
});

twitchClient.connect().catch(console.error);

// Handle Twitch chat
twitchClient.on("message", async (_, tags, message) => {
  const emotes = tags.emotes || {};
  const emotePositions = [];

  for (const emoteId in emotes) {
    for (const range of emotes[emoteId]) {
      const [start, end] = range.split("-").map(Number);
      emotePositions.push({ start, end, emoteId });
    }
  }

  emotePositions.sort((a, b) => a.start - b.start);

  let htmlMessage = "";
  let lastIndex = 0;

  for (const { start, end, emoteId } of emotePositions) {
    htmlMessage += sanitizeText(message.slice(lastIndex, start));
    htmlMessage += `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0" alt="" class="emoji">`;
    lastIndex = end + 1;
  }

  htmlMessage += sanitizeText(message.slice(lastIndex));

  const login = tags["username"];
  const displayName = tags["display-name"];
  const avatar = await getTwitchAvatar(login);

  io.emit("chat", {
    platform: "Twitch",
    user: displayName,
    text: htmlMessage,
    avatar,
  });
});

// WebSocket connection
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("youtube_chat", ({ user, text, avatar }) => {
    if (user && text) {
      io.emit("chat", {
        platform: "YouTube",
        user,
        text,
        avatar,
      });
    }
  });

  socket.on("send", ({ target, text }) => {
    if ((target === "Twitch" || target === "Both") && text) {
      twitchClient.say(TWITCH_CHANNEL, text).catch((err) => {
        console.error("Twitch Send Error:", err.message);
      });
    }
    // No YouTube send support
  });
});

server.listen(3000, () => {
  console.log("✅ Server running at http://localhost:3000");
});
