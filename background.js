let scanState = {
    isScanning: false,
    isPaused: false,
    username: "",
    id: "",
    epoch: "",
    candidateUrls: [],
    currentIndex: 0,
    batchSize: 20,
    foundUrl: null,
    readableTime: ""
};

async function loadConfigAndDomains() {
    try {
        const [configRes, domainsRes] = await Promise.all([
            fetch(chrome.runtime.getURL('config.json')),
            fetch(chrome.runtime.getURL('domains.txt'))
        ]);
        const config = await configRes.json();
        const domainsText = await domainsRes.text();
        const domains = domainsText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        return {
            batchSize: config.batchSize || 20,
            driftStart: config.driftStart || -30,
            driftEnd: config.driftEnd || 60,
            domains: domains.length > 0 ? domains : ["https://d2nvs31859zcd8.cloudfront.net/"]
        };
    } catch (e) {
        return { batchSize: 20, driftStart: -30, driftEnd: 60, domains: ["https://d2nvs31859zcd8.cloudfront.net/"] };
    }
}

async function calculateHash(name, id, ts) {
    const input = `${name}_${id}_${ts}`;
    const msg = new TextEncoder().encode(input);
    const hashBuffer = await self.crypto.subtle.digest('SHA-1', msg);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

async function checkUrl(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok ? url : null;
    } catch (e) { return null; }
}

async function processScan() {
    if (!scanState.isScanning || scanState.isPaused || scanState.foundUrl) return;

    while (scanState.currentIndex < scanState.candidateUrls.length && scanState.isScanning && !scanState.isPaused) {
        const batch = scanState.candidateUrls.slice(scanState.currentIndex, scanState.currentIndex + scanState.batchSize);
        const results = await Promise.all(batch.map(checkUrl));
        
        scanState.currentIndex += scanState.batchSize;
        const validUrl = results.find(url => url !== null);
        
        if (validUrl) {
            scanState.foundUrl = validUrl;
            scanState.isScanning = false;
            broadcastStatus();
            return;
        }
        broadcastStatus();
    }

    if (scanState.currentIndex >= scanState.candidateUrls.length) {
        scanState.isScanning = false;
        broadcastStatus();
    }
}

function broadcastStatus() {
    chrome.runtime.sendMessage({
        action: "updateUI",
        state: {
            isScanning: scanState.isScanning,
            isPaused: scanState.isPaused,
            current: scanState.currentIndex,
            total: scanState.candidateUrls.length,
            foundUrl: scanState.foundUrl,
            username: scanState.username,
            id: scanState.id,
            readableTime: scanState.readableTime
        }
    }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startScan") {
        const { username, id, epoch, readableTime } = request.data;
        
        (async () => {
            const config = await loadConfigAndDomains();
            let standardUrls = [];
            let mutedUrls = [];

            for (let s = config.driftStart; s < config.driftEnd; s++) {
                const ts = epoch + s;
                const hash = await calculateHash(username, id, ts);
                config.domains.forEach(domain => {
                    const clean = domain.endsWith('/') ? domain.slice(0, -1) : domain;
                    const base = `${clean}/${hash}_${username}_${id}_${ts}/chunked`;
                    standardUrls.push(`${base}/index-dvr.m3u8`);
                    mutedUrls.push(`${base}/index-muted.m3u8`);
                });
            }

            // Persistence setup: Standard first, then Muted
            scanState = {
                isScanning: true,
                isPaused: false,
                username, id, epoch, readableTime,
                candidateUrls: [...standardUrls, ...mutedUrls],
                currentIndex: 0,
                batchSize: config.batchSize,
                foundUrl: null
            };

            broadcastStatus();
            await processScan();
        })();
    }
    if (request.action === "pauseScan") { scanState.isPaused = true; broadcastStatus(); }
    if (request.action === "resumeScan") { scanState.isPaused = false; broadcastStatus(); processScan(); }
    if (request.action === "getBackgroundState") { broadcastStatus(); }
    return true; 
});