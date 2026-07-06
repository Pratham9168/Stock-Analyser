const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'networkidle2', timeout: 90000 });
        
        console.log("Scrolling down to trigger Highcharts lazy load...");
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        
        await page.waitForTimeout(5000); // Wait for backtest API to finish
        
        const result = await page.evaluate(async () => {
            if (window.Highcharts && window.Highcharts.charts && window.Highcharts.charts.length > 0) {
                const chart = window.Highcharts.charts[window.Highcharts.charts.length - 1]; 
                if (chart && chart.series && chart.series[0] && chart.series[0].data) {
                    const dataPoints = chart.series[0].data;
                    
                    let availableDates = [];
                    for (let i = 0; i < dataPoints.length; i++) {
                        const pt = dataPoints[i];
                        const dateLabel = pt.name || pt.category || "";
                        availableDates.push(dateLabel);
                        
                        if (dateLabel.includes("15") && (dateLabel.includes("Apr") || dateLabel.includes("04") || dateLabel.includes("04-2026"))) {
                            // Find the container ID so we know what table updates
                            pt.firePointEvent('click');
                            return { success: true, dateClicked: dateLabel };
                        }
                    }
                    return { success: false, reason: "15th April not found.", available: availableDates.slice(-30) };
                }
            }
            return { success: false, reason: "Highcharts visual backtest not found." };
        });
        
        console.log("Highcharts injection result:", result);
        
        if (result.success) {
            console.log("Waiting 6 seconds for AJAX table update...");
            await page.waitForTimeout(6000);
            
            const stocks = await page.evaluate(() => {
                const extracted = [];
                // Look for the stocks in BOTH table 1 and table 2 in case backtest spawns a new table
                const rows = document.querySelectorAll('table tbody tr');
                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const symbol = cells[2]? cells[2].textContent.trim() : null;
                        if (symbol && symbol !== "No records found" && !symbol.includes("Loading")) extracted.push(symbol);
                    }
                });
                // remove duplicates just in case
                return [...new Set(extracted)];
            });
            
            console.log("=============== 15th APRIL RESULT ===============");
            console.log(JSON.stringify(stocks, null, 2));
            console.log("TOTAL STOCKS:", stocks.length);
        }
        
        await browser.close();
    } catch (e) {
        console.error("Crash:", e);
    }
})();
