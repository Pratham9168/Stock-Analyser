const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        let processPostData = '';

        page.on('request', request => {
            if (request.url().includes('process')) {
                processPostData = request.postData();
            }
        });

        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'networkidle2', timeout: 90000 });
        
        const testResult = await page.evaluate(async () => {
            try {
                // If Chartink holds a global var for the scan_clause or similar, try to find it.
                // Or look for any backtest function.
                const scanClause = document.querySelector('#scan_clause') ? document.querySelector('#scan_clause').value : '';
                const csrfToken = document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').content : '';

                // Try hitting the process API manually via native fetch for the backtest
                // In chartink's UI, backtest is a premium feature, BUT they pass the "bdate" or similar in AJAX.
                const payload = new URLSearchParams();
                payload.append('scan_clause', scanClause);
                
                // Let's inspect window object for chartink variables that define backtest parameters
                const glob = Object.keys(window).filter(k => k.includes('backtest') || k.includes('Chartink'));
                
                return {
                    scanClausePreview: scanClause.substring(0, 50),
                    csrfTokenLength: csrfToken.length,
                    globals: glob
                };
            } catch (e) {
                return { error: e.toString() };
            }
        });
        
        console.log("\n--- RESULT ---");
        console.log(testResult);
        console.log("Captured POST data prefix:", processPostData ? processPostData.substring(0, 50) : 'none');
        
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
