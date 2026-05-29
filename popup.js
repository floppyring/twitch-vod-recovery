// Elements
const runBtn = document.getElementById('runBtn');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const foundContainer = document.getElementById('found-container');
const metadataDiv = document.getElementById('metadata');

let currentScanEngineState = "IDLE"; // IDLE, SCANNING, PAUSED

// Ask background script for its active state as soon as popup window is opened
chrome.runtime.sendMessage({ action: "getBackgroundState" });

runBtn.addEventListener('click', async () => {
    if (currentScanEngineState === "IDLE") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        runBtn.disabled = true;
        foundContainer.innerHTML = "<small style='color: #999;'>Parsing DOM time elements...</small>";

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
                const timeEl = document.querySelector('time[datetime]');
                if (!timeEl) return { error: "No date element found on this Twitch page." };

                const rawDateTime = timeEl.getAttribute('datetime');
                const [datePart, timePart] = rawDateTime.split(' ');
                const [d, m, y] = datePart.split('-');
                const epoch = Math.floor(new Date(`${y}-${m}-${d}T${timePart}:00Z`).getTime() / 1000);
                
                return { 
                    username: document.querySelector('h1')?.innerText.split('/')[0].trim().toLowerCase(),
                    id: window.location.href.split('/').pop(),
                    epoch: epoch,
                    readableTime: rawDateTime
                };
            }
        }, (results) => {
            const data = results[0]?.result;
            if (!data || data.error) {
                foundContainer.innerHTML = `<small style='color:red;'>${data?.error || "Script context lost"}</small>`;
                runBtn.disabled = false;
                return;
            }

            // Kickoff background script thread
            chrome.runtime.sendMessage({ action: "startScan", data });
        });
    } 
    else if (currentScanEngineState === "SCANNING") {
        chrome.runtime.sendMessage({ action: "pauseScan" });
    } 
    else if (currentScanEngineState === "PAUSED") {
        chrome.runtime.sendMessage({ action: "resumeScan" });
    }
});

// Reactively draw the UI parameters based on what background.js dictates
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateUI") {
        const { isScanning, isPaused, current, total, foundUrl, username, id, readableTime } = message.state;

        // Render persistent info properties
        if (username) {
            metadataDiv.innerHTML = `
                <div><span class="meta-label">Streamer:</span> ${username}</div>
                <div><span class="meta-label">VOD ID:</span> ${id}</div>
                <div><span class="meta-label">Start Time:</span> ${readableTime}</div>
            `;
        }

        // Render progress calculations
        if (total > 0) {
            progressContainer.style.display = 'block';
            const percentage = Math.floor((current / total) * 100);
            progressBar.style.width = percentage + "%";
        }

        // State Machine UI modifications
        if (isScanning && !isPaused) {
            currentScanEngineState = "SCANNING";
            runBtn.disabled = false;
            runBtn.innerText = "PAUSE SCAN";
            runBtn.style.background = "#ff9800"; // Orange Accent
            if (!document.getElementById('vod-link-display')) {
                foundContainer.innerHTML = `<small style='color: #999;'>Scanning (${current}/${total})...</small>`;
            }
        } 
        else if (isScanning && isPaused) {
            currentScanEngineState = "PAUSED";
            runBtn.disabled = false;
            runBtn.innerText = "RESUME SCAN";
            runBtn.style.background = "#4caf50"; // Green accent
            if (!document.getElementById('vod-link-display')) {
                foundContainer.innerHTML = `<small style='color: #ff9800; font-weight:bold;'>Scan Paused</small>`;
            }
        } 
        else {
            currentScanEngineState = "IDLE";
            runBtn.disabled = false;
            runBtn.innerText = "START NEW SCAN";
            runBtn.style.background = "#f0f0f0";
            
            if (current >= total && total > 0 && !foundUrl) {
                foundContainer.innerHTML = "<small style='color:red;'>No VOD found across parameters.</small>";
            } else if (total === 0) {
                foundContainer.innerHTML = "<small id='status-placeholder' style='color: #999;'>Ready to scan...</small>";
                progressContainer.style.display = 'none';
                metadataDiv.innerHTML = "";
            }
        }

        // Render Found Results elements inline
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
            containerRenderedSafeAppend(row);
        }
    }
});

function containerRenderedSafeAppend(element) {
    if (!document.getElementById('vod-link-display')) {
        foundContainer.appendChild(element);
    }
}