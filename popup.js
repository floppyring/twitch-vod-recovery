let currentTabId = null;
let currentScanEngineState = "IDLE";

const runBtn = document.getElementById('runBtn');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const foundContainer = document.getElementById('found-container');
const metadataDiv = document.getElementById('metadata');

// Ensure button is never disabled indefinitely
function updateButtonUI(state) {
    currentScanEngineState = state;
    
    // Always enable unless we are in the middle of a "Parsing" phase
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

// Initialize: Get current tab and then ask for state
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    currentTabId = tabs[0].id;
    chrome.runtime.sendMessage({ action: "getBackgroundState", tabId: currentTabId });
});

runBtn.addEventListener('click', async () => {
    if (currentScanEngineState === "IDLE") {
        runBtn.disabled = true;
        foundContainer.innerHTML = "<small style='color: #999;'>Parsing DOM...</small>";

        chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            function: () => {
                const timeEl = document.querySelector('time[datetime]');
                if (!timeEl) return { error: "No timestamp found." };
                const rawDateTime = timeEl.getAttribute('datetime');
                const [datePart, timePart] = rawDateTime.split(' ');
                const [d, m, y] = datePart.split('-');
                const epoch = Math.floor(new Date(`${y}-${m}-${d}T${timePart}:00Z`).getTime() / 1000);
                return { 
                    username: document.querySelector('h1')?.innerText.split('/')[0].trim().toLowerCase(),
                    id: window.location.href.split('/').pop().split('?')[0],
                    epoch: epoch,
                    readableTime: rawDateTime
                };
            }
        }, (results) => {
            const data = results[0]?.result;
            if (data?.error) {
                foundContainer.innerHTML = `<small style='color:red;'>${data.error}</small>`;
                runBtn.disabled = false;
                return;
            }
            chrome.runtime.sendMessage({ action: "startScan", data, tabId: currentTabId });
        });
    } 
    else if (currentScanEngineState === "SCANNING") {
        chrome.runtime.sendMessage({ action: "pauseScan", tabId: currentTabId });
    } 
    else if (currentScanEngineState === "PAUSED") {
        chrome.runtime.sendMessage({ action: "resumeScan", tabId: currentTabId });
    }
});

chrome.runtime.onMessage.addListener((message) => {
    // Only update the UI if the message is for the tab the user is looking at
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
            
            // Only show "Scanning (x/y)" if total is actually a number
            if (!foundUrl && total > 0) {
                foundContainer.innerHTML = `<small>Scanning (${current} / ${total})...</small>`;
            } else if (!foundUrl) {
                foundContainer.innerHTML = `<small>Initializing scan...</small>`;
            }
        }
        else if (isScanning && isPaused) {
            updateButtonUI("PAUSED");
            if (!foundUrl) foundContainer.innerHTML = `<small style='color: #ff9800;'>Scan Paused</small>`;
        } 
        else {
            updateButtonUI("IDLE");
            if (current >= total && total > 0 && !foundUrl) {
                foundContainer.innerHTML = "<small style='color:red;'>No VOD found.</small>";
            }
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