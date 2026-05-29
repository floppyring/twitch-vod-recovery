// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkVOD") {
    // Perform the HEAD request
    fetch(request.url, { method: 'HEAD' })
      .then(response => {
        sendResponse({ status: response.status, ok: response.ok });
      })
      .catch(error => {
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Keeps the messaging channel open for the async fetch
  }
});