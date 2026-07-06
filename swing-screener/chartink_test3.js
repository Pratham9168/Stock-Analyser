const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'networkidle2', timeout: 90000 });
        
        console.log("Scrolling down to load chart...");
        await page.evaluate(() => window.scrollTo(0, 1500));
        await page.waitForTimeout(5000);
        
        console.log("Clicking April 15th via SVG <rect>...");
        const clickResult = await page.evaluate(() => {
            const rects = Array.from(document.querySelectorAll('rect'));
            // Look for any text or aria labels containing "15" and "Apr"
            const target = rects.find(el => {
                const label = el.getAttribute('aria-label') || '';
                return label.includes('15') && (label.includes('Apr') || label.includes('04'));
            });
            
            if (target) {
                // Highcharts elements need to trigger native events or rely on the wrapper
                target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                return { success: true, label: target.getAttribute('aria-label') };
            }
            return { success: false, reason: "No matching SVG element found for 15 Apr.", sample: rects.slice(0,5).map(r=>r.getAttribute('aria-label')) };
        });
        
        console.log("Click Output:", clickResult);
        
        if (clickResult.success) {
            console.log("Waiting 6s for AJAX...");
            await page.waitForTimeout(6000);
            
            const stocks = await page.evaluate(() => {
                const extracted = [];
                const rows = document.querySelectorAll('table tbody tr');
                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const symbol = cells[2]? cells[2].textContent.trim() : null;
                        if (symbol && symbol !== "No records found" && !symbol.includes("Loading")) extracted.push(symbol);
                    }
                });
                return [...new Set(extracted)];
            });
            
            console.log("=============== 15th APRIL RESULT ===============");
            console.log(JSON.stringify(stocks, null, 2));
            console.log("TOTAL STOCKS:", stocks.length);
        }
        
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
