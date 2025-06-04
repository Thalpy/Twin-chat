require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tmi = require("tmi.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//Sound
const player = require("play-sound")();
const path = require("path");

app.use(express.static("public"));

// Twitch credentials
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TWITCH_OAUTH = process.env.TWITCH_OAUTH;

// Setup Twitch client
const twitchClient = new tmi.Client({
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH,
  },
  channels: [TWITCH_CHANNEL],
});

function playNotification() {
  const soundPath = path.join(__dirname, "notify.mp3");
  player.play(soundPath, (err) => {
    if (err) console.error("Sound error:", err);
  });
}


twitchClient.connect().catch(console.error);

// Broadcast Twitch messages to all connected frontends
twitchClient.on("message", (_, tags, message) => {
  io.emit("chat", {
    platform: "Twitch",
    user: tags["display-name"],
    text: message,
  });
});

// WebSocket: handle messages from frontend and from YouTube scraper
io.on("connection", (socket) => {
  console.log("Client connected");

    socket.on("youtube_chat", ({ user, text }) => {
      if (user && text) {
        io.emit("chat", {
          platform: "YouTube",
          user,
          text,
        });
        playNotification(); // 🔔 Notify for YouTube
      }
    });

    socket.on("twitch_chat", ({ user, text }) => {
      if (user && text) {
        io.emit("chat", {
          platform: "Twitch",
          user,
          text,
        });
        playNotification(); // 🔔 Notify for Twitch
      }
    });
  
  // Incoming messages from frontend (to Twitch or YouTube)
  socket.on("send", ({ target, text }) => {
    if ((target === "Twitch" || target === "Both") && text) {
      twitchClient.say(TWITCH_CHANNEL, text).catch((err) => {
        console.error("Twitch Send Error:", err.message);
      });
    }
    // No YouTube sending here – handled externally if ever enabled
  });
});

server.listen(3000, () => {
  console.log("✅ Server running at http://localhost:3000");
});
