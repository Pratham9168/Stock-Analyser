const yahooFinance = require('yahoo-finance2').default;
(async () => {
    try {
        const quote = await yahooFinance.quoteSummary('RELIANCE.NS', { modules: ['assetProfile'] });
        console.log(quote.assetProfile);
    } catch (e) {
        console.error(e);
    }
})();
