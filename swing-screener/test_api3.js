const { NseDataService } = require('./dist/src/services/NseDataService');
async function test() {
  const nse = new NseDataService();
  const res = await nse.fetchStocksByIndex('NIFTY 50');
  console.log(JSON.stringify(res).substring(0, 500));
}
test().catch(console.error);
