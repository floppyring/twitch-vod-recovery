const VOD_DOMAINS = [
  "https://vod-secure.twitch.tv/",
  "https://vod-metro.twitch.tv/",
  "https://vod-pop-secure.twitch.tv/",
  "https://d2e2de1etea730.cloudfront.net/",
  "https://dqrpb9wgowsf5.cloudfront.net/",
  "https://ds0h3roq6wcgc.cloudfront.net/",
  "https://d2nvs31859zcd8.cloudfront.net/",
  "https://d2aba1wr3818hz.cloudfront.net/",
  "https://d3c27h4odz752x.cloudfront.net/",
  "https://dgeft87wbj63p.cloudfront.net/",
  "https://d1m7jfoe9zdc1j.cloudfront.net/",
  "https://d3vd9lfkzbru3h.cloudfront.net/",
  "https://d2vjef5jvl6bfs.cloudfront.net/",
  "https://d1ymi26ma8va5x.cloudfront.net/",
  "https://d1mhjrowxxagfy.cloudfront.net/",
  "https://ddacn6pr5v0tl.cloudfront.net/",
  "https://d3aqoihi2n8ty8.cloudfront.net/",
  "https://d3fi1amfgojobc.cloudfront.net/",
  "https://d3stzm2eumvgb4.cloudfront.net/",
  "https://d2vi6trrdongqn.cloudfront.net/"
];

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

/**
 * Loads config.json and domains.txt in parallel
 */
async function loadConfigAndDomains() {
    try {
        const [configResponse, domainsResponse] = await Promise.all([
            fetch(chrome.runtime.getURL('config.json')),
            fetch(chrome.runtime.getURL('domains.txt'))
        ]);

        const config = await configResponse.json();
        const domainsText = await domainsResponse.text();

        // Convert line-by-line text into a clean array
        const domains = domainsText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        return {
            batchSize: config.batchSize || 20,
            driftStart: config.driftStart || -30,
            driftEnd: config.driftEnd || 60,
            domains: domains.length > 0 ? domains : VOD_DOMAINS
        };
    } catch (e) {
        // Safe fallbacks if either file is missing or formatted wrong
        return { 
            batchSize: 20, 
            driftStart: -30, 
            driftEnd: 60, 
            domains: VOD_DOMAINS 
        };
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
    // Standard gate: stop if not scanning, paused, or if we ALREADY found a VOD
    if (!scanState.isScanning || scanState.isPaused || scanState.foundUrl) return;

    const total = scanState.candidateUrls.length;

    // Process loop by batches
    while (scanState.currentIndex < total && scanState.isScanning && !scanState.isPaused) {
        const batch = scanState.candidateUrls.slice(scanState.currentIndex, scanState.currentIndex + scanState.batchSize);
        const results = await Promise.all(batch.map(checkUrl));
        
        // Update index for progress bar
        scanState.currentIndex += scanState.batchSize;
        if (scanState.currentIndex > total) scanState.currentIndex = total;

        // Check if any URL in this batch was valid
        const validUrl = results.find(url => url !== null);
        
        if (validUrl) {
            scanState.foundUrl = validUrl;
            scanState.isScanning = false; // STOP THE SCAN IMMEDIATELY
            broadcastStatus();
            return; // Exit the function entirely
        }

        // Broadcast progress for the current batch if nothing found yet
        broadcastStatus();
    }

    // Mark as finished if we reached the end without finding anything
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
        // Ignore errors when popup window is closed
    });
}

// Handle incoming control signals from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startScan") {
        const { username, id, epoch, readableTime } = request.data;
        
        (async () => {
            // Fetch configuration parameters and domains from separate text files
            const config = await loadConfigAndDomains();
            
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
        broadcastStatus();
    }
});