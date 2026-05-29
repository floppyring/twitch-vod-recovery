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
        const domain = "https://d2nvs31859zcd8.cloudfront.net/";

        (async () => {
            let candidateUrls = [];

            // Generate hashes for the 90-second drift window
            for (let s = -30; s < 60; s++) {
                const ts = epoch + s;
                const hash = await calculateHash(username, id, ts);
                candidateUrls.push(`${domain}${hash}_${username}_${id}_${ts}/chunked/index-dvr.m3u8`);
            }

            // Perform parallel HEAD checks
            const results = await Promise.all(candidateUrls.map(checkUrl));
            
            // Send back only the verified URLs
            sendResponse({ urls: results.filter(url => url !== null) });
        })();
        
        return true; 
    }
});