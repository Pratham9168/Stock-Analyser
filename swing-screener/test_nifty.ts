import { YahooBrowserService } from '/Users/kesha/Desktop/Stock-Analyser-1/swing-screener/src/services/YahooBrowserService';
import { NseDataService } from '/Users/kesha/Desktop/Stock-Analyser-1/swing-screener/src/services/NseDataService';

async function test() {
  const nse = new NseDataService();
  const nseN50 = await nse.fetchStocksByIndex('NIFTY 50');
  console.log('NIFTY 50 NSE metadata lastPrice:', nseN50?.metadata?.lastPrice || nseN50?.metadata?.last);
  const nseN500 = await nse.fetchStocksByIndex('NIFTY 500');
  console.log('NIFTY 500 NSE metadata lastPrice:', nseN500?.metadata?.lastPrice || nseN500?.metadata?.last);

  const yahoo = new YahooBrowserService();
  await yahoo.initialize();
  const n50 = await yahoo.fetchCurrentQuote('^NSEI');
  console.log('NIFTY 50 Yahoo:', n50?.price);
  const n500 = await yahoo.fetchCurrentQuote('^CRSLDX');
  console.log('NIFTY 500 Yahoo:', n500?.price);
  await yahoo.close();
}
test().catch(console.error);
