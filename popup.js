let currentTabId = null;
let currentScanEngineState = "IDLE";

const runBtn = document.getElementById('runBtn');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const foundContainer = document.getElementById('found-container');
const metadataDiv = document.getElementById('metadata');

// Define extraction strategies
const extractors = {
    "streamscharts.com": () => {
        const usernameEl = document.querySelector('h1')?.innerText.split('/')[0].trim().toLowerCase();
        const id = window.location.href.split('/').pop().split('?')[0];
        const timeEl = document.querySelector('time[datetime]');
        if (!timeEl) return { error: "No timestamp found." };
        
        const rawDateTime = timeEl.getAttribute('datetime');
        const [datePart, timePart] = rawDateTime.split(' ');
        const [d, m, y] = datePart.split('-');
        const epoch = Math.floor(new Date(`${y}-${m}-${d}T${timePart}:00Z`).getTime() / 1000);
        const readableTime = new Date(epoch * 1000).toLocaleString();
        
        return { 
            username: usernameEl,
            id: id,
            epoch: epoch,
            readableTime: readableTime
        };
    },
    "twitchtracker.com": () => {
        const username = window.location.pathname.split('/')[1];
        const vodId = window.location.href.split('/').pop().split('?')[0];
        
        // Target the specific element containing the date
        const dateEl = document.querySelector('.stream-timestamp-dt');
        if (!dateEl) return { error: "Could not find .stream-timestamp-dt" };

        // 1. Clean the date string: "Thu, May 28, 00:16" -> "May 28 00:16 2026"
        const dateText = dateEl.innerText.trim();
        const cleanDateText = dateText.split(', ').slice(1).join(' ') + " " + new Date().getFullYear();
        
        const rawDate = new Date(cleanDateText);
        if (isNaN(rawDate.getTime())) return { error: "Invalid date parsing" };

        const adjustedTime = rawDate.getTime();
        const epoch = Math.floor(adjustedTime / 1000);
        const readableTime = new Date(epoch * 1000).toLocaleString();

        return {
            username: username.toLowerCase(),
            id: vodId,
            epoch: epoch,
            readableTime: readableTime
        };
    }
};

function updateButtonUI(state) {
    currentScanEngineState = state;
    runBtn.disabled = false; 
    if (state === "SCANNING") {
        runBtn.innerText = "PAUSE SCAN";
        runBtn.style.background = "#ff9800";
    } else if (state === "PAUSED") {
        runBtn.innerText = "RESUME SCAN";
        runBtn.style.background = "#4caf50";
    } else {
        runBtn.innerText = "START NEW SCAN";
        runBtn.style.background = "#f0f0f0";
    }
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    currentTabId = tabs[0].id;
    chrome.runtime.sendMessage({ action: "getBackgroundState", tabId: currentTabId });
});

runBtn.addEventListener('click', async () => {
    if (currentScanEngineState === "IDLE") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const domain = new URL(tab.url).hostname.replace('www.', '');
        const extractorFunc = extractors[domain];

        if (!extractorFunc) {
            foundContainer.innerHTML = "<small style='color:red;'>Site not supported.</small>";
            return;
        }

        runBtn.disabled = true;
        foundContainer.innerHTML = "<small style='color: #999;'>Parsing DOM...</small>";

        chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            func: extractorFunc
        }, (results) => {
            // 1. Check if scripting even returned a result
            if (!results || !results[0] || !results[0].result) {
                foundContainer.innerHTML = "<small style='color:red;'>Failed to extract data: No result.</small>";
                runBtn.disabled = false;
                return;
            }

            const data = results[0]?.result;

            // 2. Check for our custom error messages
            if (data.error) {
                console.error("Extraction error:", data.error);
                foundContainer.innerHTML = `<small style='color:red;'>${data.error}</small>`;
                runBtn.disabled = false;
                return;
            }

            chrome.runtime.sendMessage({ action: "startScan", data, tabId: currentTabId });
        });
    } else if (currentScanEngineState === "SCANNING") {
        chrome.runtime.sendMessage({ action: "pauseScan", tabId: currentTabId });
    } else if (currentScanEngineState === "PAUSED") {
        chrome.runtime.sendMessage({ action: "resumeScan", tabId: currentTabId });
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateUI" && message.tabId === currentTabId) {
        const { isScanning, isPaused, current, total, foundUrl, username, id, readableTime } = message.state;

        if (username) {
            metadataDiv.innerHTML = `
                <div><span class="meta-label">Streamer:</span> ${username}</div>
                <div><span class="meta-label">VOD ID:</span> ${id}</div>
                <div><span class="meta-label">Start Time:</span> ${readableTime}</div>
            `;
        }
        if (total > 0) {
            progressContainer.style.display = 'block';
            progressBar.style.width = Math.floor((current / total) * 100) + "%";
        }
        if (isScanning && !isPaused) {
            updateButtonUI("SCANNING");
            if (!foundUrl && total > 0) foundContainer.innerHTML = `<small>Scanning (${current} / ${total})...</small>`;
            else if (!foundUrl) foundContainer.innerHTML = `<small>Initializing scan...</small>`;
        } else if (isScanning && isPaused) {
            updateButtonUI("PAUSED");
            if (!foundUrl) foundContainer.innerHTML = `<small style='color: #ff9800;'>Scan Paused</small>`;
        } else {
            updateButtonUI("IDLE");
            if (current >= total && total > 0 && !foundUrl) foundContainer.innerHTML = "<small style='color:red;'>No VOD found.</small>";
        }

        if (foundUrl && !document.getElementById('vod-link-display')) {
            foundContainer.innerHTML = "<strong>Result Found:</strong>"; 
            const row = document.createElement('div');
            row.className = 'link-row';
            const linkDisplay = document.createElement('span');
            linkDisplay.id = 'vod-link-display';
            linkDisplay.innerText = foundUrl;
            linkDisplay.onclick = () => window.open(foundUrl, '_blank');
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-icon-btn';
            copyBtn.innerText = "COPY";
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(foundUrl).then(() => {
                    const toast = document.getElementById('copy-toast');
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 2000);
                });
            };
            row.appendChild(linkDisplay);
            row.appendChild(copyBtn);
            foundContainer.appendChild(row);
        }
    }
});