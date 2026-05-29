/**
 * Loads configuration from config.json
 */
async function loadConfig() {
    const response = await fetch(chrome.runtime.getURL('config.json'));
    return await response.json();
}

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
    } catch (e) { return null; }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generateList") {
        const { username, id, epoch } = request.data;

        (async () => {
            // LOAD CONFIG DYNAMICALLY
            const config = await loadConfig();
            const { batchSize, driftStart, driftEnd, domains } = config;

            let candidateUrls = [];
            // Use drift values from JSON
            for (let s = driftStart; s < driftEnd; s++) {
                const ts = epoch + s;
                const hash = await calculateHash(username, id, ts);
                const path = `${hash}_${username}_${id}_${ts}/chunked/index-dvr.m3u8`;
                
                domains.forEach(domain => {
                    const cleanDomain = domain.endsWith('/') ? domain.slice(0, -1) : domain;
                    candidateUrls.push(`${cleanDomain}/${path}`);
                });
            }

            const total = candidateUrls.length;
            for (let i = 0; i < total; i += batchSize) {
                const batch = candidateUrls.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(checkUrl));
                
                results.forEach(validUrl => {
                    chrome.runtime.sendMessage({
                        action: "updateUI",
                        current: Math.min(i + batchSize, total),
                        total: total,
                        foundUrl: validUrl
                    });
                });
            }
        })();
        return true; 
    }
});