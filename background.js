// Ensure this matches your Python epoch math exactly
async function calculateHash(streamer, id, ts) {
  // Python: f'{streamer_name}_{video_id}_{int(calculate_epoch_timestamp(...))}'
  const input = `${streamer}_${id}_${ts}`;
  console.log(`Calculating hash for input: ${input}`);
  const msg = new TextEncoder().encode(input);
  const hashBuffer = await self.crypto.subtle.digest('SHA-1', msg);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Python: [:20]
  return hash.slice(0, 20);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateList") {
    const { username, id, epoch } = request.data;
    const domain = "https://d2nvs31859zcd8.cloudfront.net/"; // Your specific domain
    const quality = "chunked";

    (async () => {
      let urls = [];
      for (let s = -30; s < 60; s++) {
        const ts = epoch + s;
        const hash = await calculateHash(username, id, ts);
        
        // This is the exact string structure from your Python f-string
        const url = `${domain}${hash}_${username}_${id}_${ts}/${quality}/index-dvr.m3u8`;
        urls.push(url);
      }
      sendResponse({ urls: urls });
    })();
    return true;
  }
});