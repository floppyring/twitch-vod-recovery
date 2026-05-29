# Twitch VOD Recovery Extension

This extension automates the discovery of missing or unlisted Twitch VOD chunks by scanning CDN domains for valid `.m3u8` index files.

## ⚠️ Important Compatibility Note
**This extension currently only supports data sourced from [StreamsCharts](https://streamscharts.com/).** The extension relies on specific DOM structures (such as `<time>` elements) found on StreamsCharts VOD pages to accurately parse the stream start time and metadata required to generate the correct VOD hash.

## 🛠️ Installation Guide (Developer Mode)

Since this is a custom-built extension, you must load it manually into Chrome:

1. **Download/Save the files:** Ensure all your project files (`manifest.json`, `background.js`, `popup.js`, `popup.html`, `config.json`, and `domains.txt`) are in a single folder.
2. **Open Extensions Page:** In Chrome, type `chrome://extensions/` in the address bar and press Enter.
3. **Enable Developer Mode:** Toggle the **"Developer mode"** switch in the top-right corner of the page.
4. **Load the Extension:** Click the **"Load unpacked"** button that appears in the top-left corner.
5. **Select Folder:** Select the folder where you saved your project files.
6. **Refresh:** The extension will now appear in your browser toolbar. If you make any changes to the code, simply click the **Refresh/Reload** icon on the extension card in the `chrome://extensions/` page to apply updates.

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