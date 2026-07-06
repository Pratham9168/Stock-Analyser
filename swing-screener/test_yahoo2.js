const yahooFinance = require('yahoo-finance2').default;
(async () => {
    try {
        const quote = await yahooFinance.quoteSummary('TCS.NS', { modules: ['assetProfile'] });
        console.log(quote.assetProfile.industry);
    } catch (e) {
        console.error(e.message);
    }
})();
