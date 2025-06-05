# Twin-Chat

A lightweight Node.js tool that displays messages from Twitch and YouTube Live together in one browser window. It is designed for independent streamers who want to monitor both platforms in a single place.

## Features

- Combines Twitch and YouTube Live chat
- Works without third-party services
- Emotes and user avatars are shown where possible
- Notification sound on new messages
- Optional chroma key mode for OBS overlays
- Messages are color-coded by user for clarity
- Darkmode! Non optional, but highly recommended! (you can change the colors in the `public/style.css` file)
- sanitizes emotes and images for safety

## Usage

1. Add your Twitch credentials to a `.env` file (Create a new file named `.env` in the root directory of the project):
```env
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_OAUTH_TOKEN=your_twitch_oauth_token
TWITCH_USERNAME=your_twitch_username
```
2. Install dependencies:
```
npm install
```
3. Start the server:
```
npm start
```
4. In another terminal, start the youtube live chat:
```
npm run youtube
```
This will start the YouTube Live chat listener. You need to put in the url into the terminal when prompted. It will open a browser window with the youtube's video chat (this is so you can moderate the chat if you want to). Don't close this window, it is needed for the chat to work.
5. Open your browser and go to `http://localhost:3000` to view the combined chat.

## Notes
- Emotes and images are sanitized for safety.
- For local use only.
