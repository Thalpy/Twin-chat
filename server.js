require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const tmi = require("tmi.js");
const { google } = require("googleapis");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL;
const TWITCH_USERNAME = process.env.TWITCH_USERNAME;
const TWITCH_OAUTH = process.env.TWITCH_OAUTH;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

let youtubeLiveChatId = null;
require("dotenv").config();

// Twitch Client
const twitchClient = new tmi.Client({
  identity: {
    username: TWITCH_USERNAME,
    password: TWITCH_OAUTH,
  },
  channels: [TWITCH_CHANNEL],
});

twitchClient.connect();

// YouTube Polling
const youtube = google.youtube({ version: "v3", auth: YOUTUBE_API_KEY });

async function pollYouTubeChat() {
  try {
    if (!youtubeLiveChatId) {
      const res = await youtube.liveBroadcasts.list({
        part: "snippet",
        broadcastStatus: "active",
        mine: true,
      });
      youtubeLiveChatId = res.data.items[0]?.snippet?.liveChatId;
    }

    if (youtubeLiveChatId) {
      const response = await youtube.liveChatMessages.list({
        liveChatId: youtubeLiveChatId,
        part: "snippet,authorDetails",
      });

      for (const msg of response.data.items) {
        io.emit("chat", {
          platform: "YouTube",
          user: msg.authorDetails.displayName,
          text: msg.snippet.displayMessage,
        });
      }
    }
  } catch (e) {
    console.error("YouTube error:", e.message);
  }

  setTimeout(pollYouTubeChat, 5000);
}

// Handle incoming chat from client
io.on("connection", (socket) => {
  socket.on("send", ({ target, text }) => {
    if (target === "Twitch" || target === "Both") {
      twitchClient.say(TWITCH_CHANNEL, text);
    }
    if ((target === "YouTube" || target === "Both") && youtubeLiveChatId) {
      youtube.liveChatMessages
        .insert({
          part: "snippet",
          requestBody: {
            snippet: {
              liveChatId: youtubeLiveChatId,
              type: "textMessageEvent",
              textMessageDetails: {
                messageText: text,
              },
            },
          },
        })
        .catch((e) => console.error("YT Send Error:", e.message));
    }
  });
});

twitchClient.on("message", (_, tags, message) => {
  io.emit("chat", {
    platform: "Twitch",
    user: tags["display-name"],
    text: message,
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  pollYouTubeChat();
});
