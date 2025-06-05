require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tmi = require("tmi.js");
const path = require("path");
const fs = require("fs");

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

// Setup Twitch client
const twitchClient = new tmi.Client({
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH,
  },
  channels: [TWITCH_CHANNEL],
});

twitchClient.connect().catch(console.error);

// Broadcast Twitch messages to all connected frontends
twitchClient.on("message", (_, tags, message) => {
  const emotes = tags.emotes || {};
  const emotePositions = [];

  // Gather all emote positions
  for (const emoteId in emotes) {
    for (const range of emotes[emoteId]) {
      const [start, end] = range.split("-").map(Number);
      emotePositions.push({ start, end, emoteId });
    }
  }

  // Sort emotes by start position (ascending)
  emotePositions.sort((a, b) => a.start - b.start);

  // Build HTML with emotes
  let htmlMessage = "";
  let lastIndex = 0;

  for (const { start, end, emoteId } of emotePositions) {
    // Add text before this emote
    htmlMessage += sanitizeText(message.slice(lastIndex, start));

    // Add emote
    const img = `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0" alt="" class="emoji">`;
    htmlMessage += img;

    lastIndex = end + 1;
  }

  // Add remaining text
  htmlMessage += sanitizeText(message.slice(lastIndex));

  io.emit("chat", {
    platform: "Twitch",
    user: tags["display-name"],
    text: htmlMessage,
    avatar: `https://static-cdn.jtvnw.net/jtv_user_pictures/${tags["user-id"]}-profile_image-70x70.png`, // fallback guess
  });
});

// Utility to safely escape HTML
function sanitizeText(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}



// WebSocket: handle messages from frontend and from YouTube scraper
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("youtube_chat", ({ user, text }) => {
    if (user && text) {
      io.emit("chat", {
        platform: "Twitch",
        user: tags["display-name"],
        text: htmlMessage,
        avatar: `https://static-cdn.jtvnw.net/jtv_user_pictures/${tags["user-id"]}-profile_image-70x70.png`,
      });
    }
  });

  socket.on("twitch_chat", ({ user, text }) => {
    if (user && text) {
      io.emit("chat", {
        platform: "Twitch",
        user,
        text,
      });
    }
  });

  socket.on("send", ({ target, text }) => {
    if ((target === "Twitch" || target === "Both") && text) {
      twitchClient.say(TWITCH_CHANNEL, text).catch((err) => {
        console.error("Twitch Send Error:", err.message);
      });
    }
  });
});

server.listen(3000, () => {
  console.log("✅ Server running at http://localhost:3000");
});
