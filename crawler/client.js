const puppeteer = require('puppeteer'); // or playwright

async function detectPrototypePollution(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log(`Testing: ${url}`);

    const payloads = [
        '__proto__[__testProtoPollution__]=DETECTED',
        'constructor.prototype.__testProtoPollution__=DETECTED',
        'a[__proto__][__testProtoPollution__]=DETECTED', // common for nested objects
        // Add more common pollution vectors
    ];

    for (const payload of payloads) {
        const testUrl = `${url}${url.includes('?') ? '&' : '?'}${payload}`;
        console.log(`Visiting with payload: ${testUrl}`);

        try {
            await page.goto(testUrl, { waitUntil: 'networkidle0', timeout: 30000 });

            // Execute JavaScript in the browser context to check for pollution
            const pollutionDetected = await page.evaluate(() => {
                // Check if the injected property exists on a new, empty object
                // or a common DOM element.
                const testKey = '__testProtoPollution__';
                if (({}).hasOwnProperty(testKey)) {
                    console.log(`[Client-Side Prototype Pollution Detected] on empty object: ${({}[testKey])}`);
                    return true;
                }
                // Also check if it appears on a new DOM element (though less common for direct DOM pollution)
                if (document.createElement('div').hasOwnProperty(testKey)) {
                     console.log(`[Client-Side Prototype Pollution Detected] on new div element: ${document.createElement('div')[testKey]}`);
                     return true;
                }
                // You might also check specific application-defined global objects if you know them.
                return false;
            });

            if (pollutionDetected) {
                console.warn(`[VULNERABILITY FOUND] Client-side Prototype Pollution detected with payload: ${testUrl}`);
                // You would typically log this to a report and potentially capture a screenshot
                // await page.screenshot({ path: `pollution_detected_${Date.now()}.png` });
                // break; // Optionally stop after first detection
            } else {
                console.log(`No pollution detected with payload: ${testUrl}`);
            }

        } catch (error) {
            console.error(`Error navigating or evaluating for ${testUrl}: ${error.message}`);
        }
    }

    await browser.close();
}

// --- Usage Example (for your OWN web application) ---
// ONLY run this on applications you own and have explicit permission to test.
// detectPrototypePollution('http://localhost:3000');
// detectPrototypePollution('https://your-website.com/some-page');