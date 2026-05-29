# Twitch VOD Recovery Extension

This extension automates the discovery of missing Twitch VOD chunks by scanning CDN domains for valid `.m3u8` index files.

## Configuration Guide: Batch Size

The `batchSize` parameter in your `config.json` determines how many URL requests are sent to the Twitch CDN simultaneously.

### Why Batching Matters

* **Performance:** Sending all 1800+ URL requests to the server at once can trigger rate-limiting, cause the browser to throttle network connections, or result in failed requests.
* **Reliability:** By grouping these requests into manageable "batches," the extension maintains a steady pace, ensuring accurate verification of each link.
* **Suggested Values:**
    * **100 (Recommended):** A safe, standard pace that provides a balance between speed and reliability.
    *Note: Higher values increase the risk of temporary CDN blocking.*

### How to Adjust

1. Open `config.json` in your extension root folder.
2. Edit the `batchSize` integer:

```json
   {
     "batchSize": 20
   }