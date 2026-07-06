import { NseDataService } from './src/services/NseDataService';

async function test() {
    const nse = new NseDataService();
    try {
        const q = await nse.fetchQuote('TCS');
        console.log('TCS Industry:', q?.industry);
    } catch (e) {
        console.error('Failed', e);
    }
}
test();
