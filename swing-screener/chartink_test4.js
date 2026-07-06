const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'networkidle2', timeout: 90000 });
        
        console.log("Scrolling down...");
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(5000);
        
        console.log("Locating April 15th Highcharts Point object...");
        const clickResult = await page.evaluate(() => {
            if (window.Highcharts && window.Highcharts.charts) {
                const chart = window.Highcharts.charts[window.Highcharts.charts.length - 1]; 
                if (chart && chart.series && chart.series[0] && chart.series[0].points) {
                    const points = chart.series[0].points;
                    let labels = [];
                    for (let i = 0; i < points.length; i++) {
                        const pt = points[i];
                        const dateLabel = pt.name || pt.category || "";
                        labels.push(dateLabel);
                        
                        if (dateLabel.includes("15") && (dateLabel.includes("Apr") || dateLabel.includes("04"))) {
                            // THIS correctly fires the Highcharts point click event!
                            pt.firePointEvent('click');
                            return { success: true, date: dateLabel };
                        }
                    }
                    return { success: false, reason: "15 Apr not found in points array.", avail: labels.slice(-20) };
                }
            }
            return { success: false, reason: "Highcharts Points not instantiated." };
        });
        
        console.log("Highcharts Click:", clickResult);
        
        if (clickResult.success) {
            console.log("Waiting 6 seconds for Chartink AJAX Table Load...");
            await page.waitForTimeout(6000);
            
            const stocks = await page.evaluate(() => {
                const extracted = [];
                // Target the DataTables specifically
                const rows = document.querySelectorAll('table.dataTable tbody tr');
                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const symbol = cells[2]? cells[2].textContent.trim() : null;
                        if (symbol && symbol !== "No records found" && !symbol.includes("Loading")) extracted.push(symbol);
                    }
                });
                return [...new Set(extracted)]; // Unique array
            });
            
            console.log("=============== 15 APRIL 2026 RESULT ===============");
            console.log(JSON.stringify(stocks, null, 2));
            console.log("Total Count:", stocks.length);
        }
        
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
