// Persistent background state
let scanState = {
    isScanning: false,
    isPaused: false,
    username: "",
    id: "",
    epoch: "",
    candidateUrls: [],
    currentIndex: 0,
    batchSize: 20,
    foundUrl: null
};

async function loadConfig() {
    try {
        const response = await fetch(chrome.runtime.getURL('config.json'));
        return await response.json();
    } catch (e) {
        // Fallback defaults if config fails
        return { batchSize: 20, driftStart: -30, driftEnd: 60, domains: ["https://d2nvs31859zcd8.cloudfront.net/"] };
    }
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

// Main background processing loop
async function processScan() {
    if (!scanState.isScanning || scanState.isPaused) return;

    const total = scanState.candidateUrls.length;

    // Process loop by batches
    while (scanState.currentIndex < total && scanState.isScanning && !scanState.isPaused) {
        const batch = scanState.candidateUrls.slice(scanState.currentIndex, scanState.currentIndex + scanState.batchSize);
        const results = await Promise.all(batch.map(checkUrl));
        
        scanState.currentIndex += scanState.batchSize;
        if (scanState.currentIndex > total) scanState.currentIndex = total;

        // Check if any URL was found
        const validUrl = results.find(url => url !== null);
        if (validUrl) {
            scanState.foundUrl = validUrl;
        }

        // Broadcast progress back to popup if it's currently open
        broadcastStatus();
    }

    // Check if finished
    if (scanState.currentIndex >= total) {
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
    }).catch(err => {
        // Suppress errors when the popup is closed (nobody is listening, which is fine!)
    });
}

// Handle incoming control signals from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startScan") {
        const { username, id, epoch, readableTime } = request.data;
        
        (async () => {
            const config = await loadConfig();
            
            // Build the checklist
            let urls = [];
            for (let s = config.driftStart; s < config.driftEnd; s++) {
                const ts = epoch + s;
                const hash = await calculateHash(username, id, ts);
                const path = `${hash}_${username}_${id}_${ts}/chunked/index-dvr.m3u8`;
                
                config.domains.forEach(domain => {
                    const cleanDomain = domain.endsWith('/') ? domain.slice(0, -1) : domain;
                    urls.push(`${cleanDomain}/${path}`);
                });
            }

            // Initialize background state machine
            scanState = {
                isScanning: true,
                isPaused: false,
                username,
                id,
                epoch,
                readableTime,
                candidateUrls: urls,
                currentIndex: 0,
                batchSize: config.batchSize,
                foundUrl: null
            };

            broadcastStatus();
            processScan();
        })();
    }

    if (request.action === "pauseScan") {
        scanState.isPaused = true;
        broadcastStatus();
    }

    if (request.action === "resumeScan") {
        scanState.isPaused = false;
        broadcastStatus();
        processScan();
    }

    if (request.action === "getBackgroundState") {
        // This is sent by popup immediately when it opens to snap back to reality
        broadcastStatus();
    }
});