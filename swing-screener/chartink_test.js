const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log("Launching browser...");
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        console.log("Navigating to screener...");
        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        console.log("Waiting for table and chart to settle...");
        await page.waitForTimeout(6000);
        
        console.log("Attempting to dynamically click '15 April' via Highcharts API...");
        const result = await page.evaluate(async () => {
            if (window.Highcharts && window.Highcharts.charts) {
                const chart = window.Highcharts.charts[window.Highcharts.charts.length - 1]; // Use last chart (Backtest)
                if (chart && chart.series && chart.series[0] && chart.series[0].data) {
                    const dataPoints = chart.series[0].data;
                    
                    let availableDates = [];
                    for (let i = 0; i < dataPoints.length; i++) {
                        const pt = dataPoints[i];
                        const dateLabel = pt.name || pt.category || "";
                        availableDates.push(dateLabel);
                        
                        if (dateLabel.includes("15") && (dateLabel.includes("Apr") || dateLabel.includes("04"))) {
                            pt.firePointEvent('click');
                            return { success: true, dateClicked: dateLabel };
                        }
                    }
                    return { success: false, reason: "15th April not found in recent chart bars.", available: availableDates.slice(-30) };
                }
            }
            return { success: false, reason: "Highcharts visual backtest not found on page." };
        });
        
        console.log("Highcharts injection result:", result);
        
        if (result.success) {
            console.log("Waiting 5 seconds for Chartink to return the AJAX table for the clicked date...");
            await page.waitForTimeout(5000);
            
            const stocks = await page.evaluate(() => {
                const extracted = [];
                const rows = document.querySelectorAll('table tbody tr');
                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const symbol = cells[2]? cells[2].textContent.trim() : null;
                        if (symbol && symbol !== "No records found") extracted.push(symbol);
                    }
                });
                return extracted;
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
