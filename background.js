const VOD_DOMAINS = ["https://d2nvs31859zcd8.cloudfront.net/"];

async function calculateHash(name, id, ts) {
    const input = `${name}_${id}_${ts}`;
    const msg = new TextEncoder().encode(input);
    const hashBuffer = await self.crypto.subtle.digest('SHA-1', msg);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

async function checkUrl(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok ? url : null;
    } catch (e) {
        return null;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generateList") {
        const { username, id, epoch } = request.data;

        (async () => {
            let candidateUrls = [];
            // ORIGINAL LOGIC: -30 to +60 drift
            for (let s = -30; s < 60; s++) {
                const ts = epoch + s;
                const hash = await calculateHash(username, id, ts);
                const path = `${hash}_${username}_${id}_${ts}/chunked/index-dvr.m3u8`;

                VOD_DOMAINS.forEach(domain => {
                    const cleanDomain = domain.endsWith('/') ? domain.slice(0, -1) : domain;
                    candidateUrls.push(`${cleanDomain}/${path}`);
                });
            }

            const total = candidateUrls.length;
            const batchSize = 20; 

            for (let i = 0; i < total; i += batchSize) {
                const batch = candidateUrls.slice(i, i + batchSize);
                
                // Fast parallel check for the current batch
                const results = await Promise.all(batch.map(checkUrl));
                
                // Report any valid URLs found in this batch
                results.forEach(validUrl => {
                    chrome.runtime.sendMessage({
                        action: "updateUI",
                        current: Math.min(i + batchSize, total),
                        total: total,
                        foundUrl: validUrl // null if not found
                    });
                });
            }
        })();
        return true; 
    }
});