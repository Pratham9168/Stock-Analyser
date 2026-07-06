const { NseDataService } = require('./src/services/NseDataService');
const nse = new NseDataService();
(async () => {
    try {
        const quote = await nse.fetchQuote('RELIANCE');
        console.log(quote);
    } catch (e) {
        console.error(e);
    }
})();
