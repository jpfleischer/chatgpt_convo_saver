// ==UserScript==
// @name         Indefinite Scroll + Click + Save HTML and Images (Enhanced Version)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Scrolls the Chat History sidebar until no more items, iterates from bottom to top, clicks each item, waits 6s, saves HTML and any images to unique files with chat titles.
// @author       jpfleischer
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    /***************************************************************
     * Helper: saveData function to download files
     ***************************************************************/
    var saveData = (function () {
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        return function (data, fileName) {
            var blob = new Blob([data], {type: "octet/stream"});
            var url = window.URL.createObjectURL(blob);
            a.href = url;
            a.download = fileName;
            a.click();
            window.URL.revokeObjectURL(url);
        };
    }());

    /***************************************************************
     * Configuration
     ***************************************************************/
    const sidebarSelector = 'nav[aria-label="Chat history"].flex.h-full.w-full.flex-col.px-3 .overflow-y-auto';
    const itemSelector = 'li[data-testid^="history-item-"]';
    const maxAttemptsWithoutNew = 60;   // Increased from 30 to 60 to accommodate slower loading
    const scrollCheckInterval = 2000;   // Increased from 1500ms to 2000ms for better synchronization
    const waitAfterClickMs = 6000;      // Wait time after clicking a chat in ms
    const invalidCharsRegex = /[\\/:*?"<>|]/g; // Invalid characters for filenames

    /***************************************************************
     * Global States
     ***************************************************************/
    let scrollTimer = null;
    let oldItemCount = 0;
    let attemptsWithoutNew = 0;

    /***************************************************************
     * Helper: Delay Function
     ***************************************************************/
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /***************************************************************
     * Helper: Sanitize Filename
     ***************************************************************/
    function sanitizeFileName(str) {
        // Replace invalid filesystem characters with underscores
        return str.replace(invalidCharsRegex, "_").trim();
    }

    /***************************************************************
     * PART 1: Scroll Indefinitely Until No More Items Load
     ***************************************************************/
    function startIndefiniteScrolling(container) {
        console.log("[AutoScroll] Starting indefinite scrolling until no new items appear...");

        scrollTimer = setInterval(() => {
            // Scroll to the bottom of the container
            container.scrollTop = container.scrollHeight;
            console.log("[AutoScroll] Scrolling to reveal more items...");

            // Count current number of chat items
            const items = container.querySelectorAll(itemSelector);
            const currentCount = items.length;
            console.log(`[AutoScroll] Current chat count: ${currentCount}`);

            if (currentCount > oldItemCount) {
                // New items have been loaded
                console.log(`[AutoScroll] Items increased from ${oldItemCount} to ${currentCount}. Resetting attempts.`);
                oldItemCount = currentCount;
                attemptsWithoutNew = 0;
            } else {
                attemptsWithoutNew++;
                console.log(`[AutoScroll] No new items. Attempt #${attemptsWithoutNew}/${maxAttemptsWithoutNew}`);

                if (attemptsWithoutNew >= maxAttemptsWithoutNew) {
                    console.log("[AutoScroll] No more items detected after multiple attempts. Stopping scroll.");
                    clearInterval(scrollTimer);
                    // Proceed to process chat items
                    processHistoryItems(container);
                }
            }
        }, scrollCheckInterval);
    }

    /***************************************************************
     * PART 2: Click Each Chat Item (Bottom to Top), Wait, Save HTML and Images
     ***************************************************************/
    async function processHistoryItems(container) {
        const items = container.querySelectorAll(itemSelector);
        if (!items.length) {
            console.log("[ClickPhase] No conversation items found!");
            return;
        }
        console.log(`[ClickPhase] Found ${items.length} conversation items. Iterating from bottom to top...`);

        // Iterate from the last item to the first (bottom to top)
        for (let i = items.length - 1; i >= 0; i--) {
            const li = items[i];
            const indexFromBottom = (items.length - i);
            console.log(`[ClickPhase] Clicking item #${indexFromBottom}, testid=${li.getAttribute('data-testid')}`);

            // Scroll the chat item into view
            li.scrollIntoView({ block: 'center' });

            // Find the clickable element within the chat item
            const link = li.querySelector('a[href], button');
            if (link) {
                try {
                    // Click the chat item to load its content
                    link.click();
                    console.log("[ClickPhase] Clicked. Waiting 6s for content to load...");
                    await delay(waitAfterClickMs);

                    // Extract the entire HTML content of the page
                    const htmlContent = document.documentElement.outerHTML;

                    // Extract the chat title for the filename
                    let titleDiv = li.querySelector('div[title]');
                    let convTitle = titleDiv ? titleDiv.getAttribute('title') : null;

                    if (!convTitle) {
                        // Fallback: Extract text content if title attribute is missing
                        const possibleDiv = li.querySelector('.relative.grow');
                        if (possibleDiv) {
                            convTitle = possibleDiv.textContent.trim();
                        }
                    }

                    convTitle = convTitle || "Untitled";

                    // Sanitize the chat title for use in filenames
                    const safeTitle = sanitizeFileName(convTitle);

                    console.log(`[ClickPhase] Conversation Title: "${convTitle}", Safe Title: "${safeTitle}"`);

                    // Build a unique filename using index and chat title
                    const fileName = `conversation-${indexFromBottom}-${safeTitle}.html`;
                    console.log(`[ClickPhase] Saving HTML as "${fileName}"`);

                    // Use the saveData function to download the HTML content
                    saveData(htmlContent, fileName);

                    // Now, find and download all images in the loaded conversation
                    // Assuming that the conversation content is within a specific container, adjust selector as needed
                    // For example, if conversations are loaded within a div with class 'conversation-content'
                    // Adjust the selector accordingly
                    // Here, we'll assume that images are within the main content area
                    const conversationContainer = document.querySelector('.conversation-container'); // Adjust if necessary
                    // If you don't have a specific container, you can search the entire document or find another specific container

                    // For demonstration, let's search within the entire document
                    const images = document.querySelectorAll('img[alt="Uploaded image"]');

                    if (images.length === 0) {
                        console.log(`[ClickPhase] No images found in conversation #${indexFromBottom}.`);
                    } else {
                        console.log(`[ClickPhase] Found ${images.length} image(s) in conversation #${indexFromBottom}. Starting download...`);

                        for (let imgIndex = 0; imgIndex < images.length; imgIndex++) {
                            const img = images[imgIndex];
                            const imgSrc = img.src;

                            // Extract the image extension from the src URL, default to .jpg if not found
                            let imgExtension = imgSrc.substring(imgSrc.lastIndexOf('.'));
                            if (!imgExtension || imgExtension.length > 5) { // handle cases like '.jpeg?params'
                                imgExtension = '.jpg';
                            }

                            // Build a unique filename for the image
                            const imgFileName = `conversation-${indexFromBottom}-${safeTitle}-image-${imgIndex + 1}${imgExtension}`;
                            console.log(`[ClickPhase] Saving image as "${imgFileName}"`);

                            // Fetch the image data as a blob
                            try {
                                const response = await fetch(imgSrc, {mode: 'cors'});
                                if (!response.ok) {
                                    throw new Error(`HTTP error! Status: ${response.status}`);
                                }
                                const blob = await response.blob();
                                const imgData = await blob.text(); // Convert blob to text for saveData

                                // Save the image using saveData
                                saveData(blob, imgFileName);
                            } catch (error) {
                                console.error(`[ClickPhase] Failed to download image "${imgSrc}":`, error);
                            }
                        }
                    }

                } catch (error) {
                    console.error(`[ClickPhase] Error processing item #${indexFromBottom}:`, error);
                }
            } else {
                console.warn("[ClickPhase] No clickable element found in item, skipping.");
            }
        }
        console.log("[ClickPhase] All items processed in reverse order!");
    }

    /***************************************************************
     * PART 3: Wait for Sidebar to Appear, Then Start Scrolling
     ***************************************************************/
    function waitForSidebar() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const container = document.querySelector(sidebarSelector);
                if (container) {
                    clearInterval(checkInterval);
                    resolve(container);
                } else {
                    console.log("[WaitForSidebar] Sidebar not found yet. Retrying...");
                }
            }, 1000);
        });
    }

    async function main() {
        console.log("[Main] Waiting for Chat History sidebar...");
        const container = await waitForSidebar();
        console.log("[Main] Sidebar found:", container);

        // Start scrolling until no new items appear
        startIndefiniteScrolling(container);
    }

    // Start the script after a short delay to ensure the page has loaded
    setTimeout(main, 3000);

})();
