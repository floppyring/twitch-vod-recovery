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

async function processScan(tabId) {
    let state = tabStates[tabId];
    if (!state || !state.isScanning || state.isPaused || state.foundUrl) return;

    while (state.currentIndex < state.candidateUrls.length && state.isScanning && !state.isPaused) {
        const batch = state.candidateUrls.slice(state.currentIndex, state.currentIndex + state.batchSize);
        const results = await Promise.all(batch.map(checkUrl));
        
        state.currentIndex += state.batchSize;
        const validUrl = results.find(url => url !== null);
        
        if (validUrl) {
            state.foundUrl = validUrl;
            state.isScanning = false;
            broadcastStatus(tabId);
            return;
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
            foundUrl: state.foundUrl || null,
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
                foundUrl: null
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