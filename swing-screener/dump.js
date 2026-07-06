const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
        const page = await browser.newPage();
        
        await page.goto('https://chartink.com/screener/shakeout-reversal', { waitUntil: 'networkidle2', timeout: 90000 });
        
        // Let's execute the backtest fetch. Chartink uses standard Datatables. 
        // Let's redefine the payload Datatables sends.
        const output = await page.evaluate(async () => {
            // Find the global variable that holds the CSRF token
            const csrf = document.querySelector('meta[name="csrf-token"]').content;
            
            // Re-create the AJAX POST that Chartink uses, but append a date!
            // Looking at standard Chartink APIs, the parameter is usually `bdate`, `date`, or `backtest`
            const formData = new URLSearchParams();
            formData.append('scan_clause', document.querySelector('#scan_clause') ? document.querySelector('#scan_clause').value : '( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( ( {cash} ( 1 = 1 and latest volume > 1000000 and latest close > 10 and latest "close - 1 candle ago close / 1 candle ago close * 100" > 0 and latest "close - 2 candles ago close / 2 candles ago close * 100" > 0 and latest close >= latest ema( close , 10 ) and latest volume > 5 candle ago sma( volume , 20 ) and latest close > latest open and latest "high - max( open, close ) / ( high - low )" < 0.4 and latest "min( open, close ) - low / ( high - low )" > 0.4 and latest rsi( 14 ) > 60 and latest macd( 12 , 26 , 9 ) > latest macd signal( 12 , 26 , 9 ) and latest close > latest ema( close , 50 ) ) ) ) ) ) ) ) ) ) ) ) ) ) )');
            formData.append('bdate', '15/04/2026'); // Backtest Date format? Or 2026-04-15? Let's send both.
            
            try {
                const response = await fetch('https://chartink.com/screener/process', {
                    method: 'POST',
                    headers: {
                        'X-CSRF-TOKEN': csrf,
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json, text/javascript, */*; q=0.01'
                    },
                    body: formData.toString()
                });
                
                return await response.json();
            } catch (e) {
                return { error: e.toString() };
            }
        });
        
        console.log("Fetch Result:", JSON.stringify(output).substring(0, 500));
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
