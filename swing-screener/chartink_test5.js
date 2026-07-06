const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'networkidle2', timeout: 90000 });
        
        console.log("Scrolling...");
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            const el = document.querySelector('#backtest-history-chart') || document.querySelector('.highcharts-container');
            if (el) el.scrollIntoView();
        });
        await page.waitForTimeout(7000);
        
        console.log("Scanning ALL Highcharts instances...");
        const result = await page.evaluate(() => {
            if (!window.Highcharts || !window.Highcharts.charts) return { success: false, reason: "No Highcharts variable." };
            
            let allLabels = [];
            for (let c = 0; c < window.Highcharts.charts.length; c++) {
                const chart = window.Highcharts.charts[c];
                if (!chart || !chart.series || !chart.series[0] || !chart.series[0].points) continue;
                
                const points = chart.series[0].points;
                for (let i = 0; i < points.length; i++) {
                    const pt = points[i];
                    const label = pt.name || pt.category || "";
                    allLabels.push(label);
                    
                    if (label.includes("15") && (label.includes("Apr") || label.includes("04"))) {
                        pt.firePointEvent('click');
                        return { success: true, date: label, chartIndex: c };
                    }
                }
            }
            return { success: false, reason: "15 Apr not found.", labelsFound: allLabels.slice(-30) };
        });
        
        console.log("Highcharts Data:", result);
        
        if (result.success) {
            console.log("Waiting 6s for AJAX...");
            await page.waitForTimeout(6000);
            const stocks = await page.evaluate(() => {
                const extracted = [];
                document.querySelectorAll('table tbody tr').forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const symbol = cells[2]? cells[2].textContent.trim() : null;
                        if (symbol && symbol !== "No records found" && !symbol.includes("Loading")) extracted.push(symbol);
                    }
                });
                return [...new Set(extracted)];
            });
            console.log("=============== 15 APRIL RESULT ===============");
            console.log(JSON.stringify(stocks, null, 2));
        }
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
