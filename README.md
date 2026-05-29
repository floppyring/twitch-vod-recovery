# Twitch VOD Recovery Extension

This extension automates the discovery of missing or unlisted Twitch VOD chunks by scanning CDN domains for valid `.m3u8` index files.

## ⚠️ Important Compatibility Note
**This extension currently only supports data sourced from [StreamsCharts](https://streamscharts.com/) and [TwitchTracker](https://twitchtracker.com/).** The extension relies on specific DOM structures (such as `<time>` elements) to accurately parse the stream start time and metadata required to generate the correct VOD hash.

### Limitations & Experimental Features
* **Quality Selection:** The extension currently only looks for default quality segments. It does **not** yet search for different quality levels (e.g., 1080p, 720p, 480p, etc.).
* **Muted Segments:** While the logic is implemented to scan `index-muted.m3u8` files, this feature is **experimental and has not been fully tested**. Results may vary based on how Twitch handles muted content availability on the CDN.

## 🛠️ Installation Guide (Developer Mode)

Since this is a custom-built extension, you must load it manually into Chrome:

1. **Download/Save the files:** Ensure all your project files (`manifest.json`, `background.js`, `popup.js`, `popup.html`, `config.json`, and `domains.txt`) are in a single folder.
2. **Open Extensions Page:** In Chrome, type `chrome://extensions/` in the address bar and press Enter.
3. **Enable Developer Mode:** Toggle the **"Developer mode"** switch in the top-right corner of the page.
4. **Load the Extension:** Click the **"Load unpacked"** button that appears in the top-left corner.
5. **Select Folder:** Select the folder where you saved your project files.
6. **Refresh:** The extension will now appear in your browser toolbar. If you make any changes to the code, simply click the **Refresh/Reload** icon on the extension card in the `chrome://extensions/` page to apply updates.

## 🛠️ Usage
1. **Navigate to the VOD page:** Open the specific streamer's VOD page on [StreamsCharts](https://streamscharts.com/) (e.g., `streamscharts.com/channels/streamername/streams/vodid`) or [TwitchTracker](https://twitchtracker.com/) (e.g., `twitchtracker.com/streamername/streams/vodid`).
2. **Open the Extension:** Click the extension icon in your browser toolbar to open the popup.
3. **Start Scan:** Click the **"START NEW SCAN"** button. The extension will parse the page for the necessary timestamp and VOD ID.
4. **Monitor Progress:** The progress bar will update in real-time as the extension cycles through candidate URLs.
5. **Retrieve Results:** If a valid VOD chunk is found, the scan will stop automatically, and the working URL will be displayed. Use the **"COPY"** button to save the link for use in video players or download tools.
6. **Management:** You can **PAUSE** or **RESUME** a scan at any time. The state is tab-specific, meaning you can scan multiple VODs in different tabs simultaneously.
---

## Configuration Guide: Batch Size

The `batchSize` parameter in your `config.json` determines how many URL requests are sent to the Twitch CDN simultaneously.

### Why Batching Matters

* **Performance:** Sending 1800+ URL requests to the server at once can trigger rate-limiting, cause the browser to throttle network connections, or result in failed requests.
* **Reliability:** By grouping these requests into manageable "batches," the extension maintains a steady, efficient pace, ensuring accurate verification of each link.
* **Suggested Values:**
    * **100 (Recommended):** A safe, standard pace that provides a balance between scan speed and request reliability.
    * *Note: Higher values may increase the risk of temporary CDN blocking.*

### How to Adjust

1. Open `config.json` in your extension root folder.
2. Edit the `batchSize` integer:

   ```json
   {
     "batchSize": 100
   }