// Default values in case config.json or domains.txt fail to load
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
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DRIFT_START = -30;
const DEFAULT_DRIFT_END = 60;

// Map to store states: Key = TabID, Value = ScanState object
let tabStates = {};

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
            batchSize: config.batchSize || DEFAULT_BATCH_SIZE,
            driftStart: config.driftStart || DEFAULT_DRIFT_START,
            driftEnd: config.driftEnd || DEFAULT_DRIFT_END,
            domains: domains.length > 0 ? domains : VOD_DOMAINS
        };
    } catch (e) {
        return { batchSize: DEFAULT_BATCH_SIZE, driftStart: DEFAULT_DRIFT_START, driftEnd: DEFAULT_DRIFT_END, domains: VOD_DOMAINS };
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

async function processScan(tabId) {
    let state = tabStates[tabId];
    if (!state || !state.isScanning || state.isPaused) return;

    if (!state.foundUrls) state.foundUrls = [];

    while (state.currentIndex < state.candidateUrls.length && state.isScanning && !state.isPaused) {
        const batch = state.candidateUrls.slice(state.currentIndex, state.currentIndex + state.batchSize);
        const results = await Promise.all(batch.map(checkUrl));
        
        state.currentIndex = Math.min(state.currentIndex + state.batchSize, state.candidateUrls.length);
        
        // Find ALL matches in the batch instead of just the first
        const matches = results.filter(url => url !== null);
        if (matches.length > 0) {
            state.foundUrls.push(...matches);
        }
        
        broadcastStatus(tabId);
    }

    if (state.currentIndex >= state.candidateUrls.length) {
        state.isScanning = false;
        broadcastStatus(tabId);
    }
}

function broadcastStatus(tabId) {
    const state = tabStates[tabId];
    if (!state) return;

    chrome.runtime.sendMessage({
        action: "updateUI",
        tabId: tabId,
        state: {
            // Add defaults here to prevent "undefined" in the UI
            isScanning: state.isScanning || false,
            isPaused: state.isPaused || false,
            current: state.currentIndex || 0,
            total: state.candidateUrls?.length || 0,
            foundUrls: state.foundUrls || [],
            username: state.username || "",
            id: state.id || "",
            readableTime: state.readableTime || ""
        }
    }).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = request.tabId || sender?.tab?.id;
    if (!tabId) return;

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

            tabStates[tabId] = {
                isScanning: true,
                isPaused: false,
                username, 
                id, 
                epoch, 
                readableTime,
                candidateUrls: [...standardUrls, ...mutedUrls],
                currentIndex: 0,
                batchSize: config.batchSize,
                foundUrls: []
            };

            broadcastStatus(tabId);
            await processScan(tabId);
        })();
    }
    
    if (request.action === "pauseScan") { 
        if (tabStates[tabId]) tabStates[tabId].isPaused = true; 
        broadcastStatus(tabId); 
    }
    
    if (request.action === "resumeScan") { 
        if (tabStates[tabId]) {
            tabStates[tabId].isPaused = false; 
            broadcastStatus(tabId); 
            processScan(tabId); 
        }
    }
    
    if (request.action === "getBackgroundState") { 
        broadcastStatus(tabId); 
    }

    return true; 
});

// Optional: Clean up memory when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStates[tabId];
});