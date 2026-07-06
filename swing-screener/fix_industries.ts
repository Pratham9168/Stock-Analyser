import { Pool } from 'pg';
import { NseDataService } from './src/services/NseDataService';
import { getParentSector } from './src/services/equialpha/sectorMapping';
import { NseSessionService } from './src/services/NseSessionService';

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/stock_analysis'
  });
  
  // Make sure to reset the session if there's any caching issue

  const nse = new NseDataService();

  const extract = (raw: any) => {
    if (!raw) return [];
    const arr = raw?.data ?? raw;
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      symbol: item.symbol || item.meta?.symbol || '',
      industry: item.industry || item.meta?.industry || ''
    })).filter((s: any) => s.symbol && s.industry);
  };

  console.log('Fetching indices...');
  const n500 = extract(await nse.fetchStocksByIndex("NIFTY 500").catch((e) => { console.log('Err n500:', e.message); return null; }));
  const m150 = extract(await nse.fetchStocksByIndex("NIFTY MIDCAP 150").catch(() => null));
  const s250 = extract(await nse.fetchStocksByIndex("NIFTY SMLCAP 250").catch(() => null));
  const micro = extract(await nse.fetchStocksByIndex("NIFTY MICROCAP 250").catch(() => null));
  
  let fno: any[] = [];
  try {
     const rawFno = await nse.fetchFnoStocks();
     fno = rawFno.map((item: any) => {
        const sym = typeof item === 'string' ? item : item.symbol;
        const ind = typeof item === 'string' ? '' : item.industry;
        return { symbol: sym, industry: ind || '' };
     }).filter((s: any) => s.symbol && s.industry);
  } catch (e) {}

  const all = [...n500, ...m150, ...s250, ...micro, ...fno];
  const unique = new Map<string, string>();
  for (const s of all) {
    unique.set(s.symbol, s.industry);
  }

  console.log(`Found ${unique.size} stocks with industries.`);
  let updated = 0;
  for (const [symbol, industry] of unique.entries()) {
    if (industry && industry !== 'Unmapped') {
      const sector = getParentSector(industry);
      await pool.query(`UPDATE ea_stock_universe SET industry = $1, sector = $2 WHERE symbol = $3`, [industry, sector, symbol]);
      updated++;
    }
  }
  
  console.log(`Updated ${updated} stocks in db.`);
  process.exit(0);
}
main().catch(console.error);
