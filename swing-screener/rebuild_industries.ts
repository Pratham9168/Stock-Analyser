import { Pool } from 'pg';
import { NseDataService } from './src/services/NseDataService';
import { getParentSector } from './src/services/equialpha/sectorMapping';

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'stock_analysis',
    user: 'kesha',
    password: '',
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    const nse = new NseDataService();
    console.log("Starting background fetch for missing industries...");

    // Get all unmapped stocks
    const res = await pool.query(`SELECT symbol FROM ea_stock_universe WHERE industry = 'Unmapped' OR sector = 'Others'`);
    const unmapped = res.rows.map(r => r.symbol);
    
    console.log(`Found ${unmapped.length} unmapped stocks to process.`);
    
    let classified = 0;
    let failed = 0;
    
    for (let i = 0; i < unmapped.length; i++) {
        const symbol = unmapped[i];
        
        if (i % 50 === 0 && i > 0) {
            console.log(`Progress: ${i}/${unmapped.length} (Classified: ${classified}, Failed: ${failed})`);
        }
        
        try {
            const nseQ = await nse.fetchQuote(symbol);
            if (nseQ && nseQ.industry) {
                const industry = nseQ.industry;
                const sector = getParentSector(industry);
                
                await pool.query(
                    `UPDATE ea_stock_universe SET industry = $1, sector = $2 WHERE symbol = $3`,
                    [industry, sector, symbol]
                );
                classified++;
            } else {
                failed++;
            }
        } catch (e: any) {
            failed++;
            console.error(`Failed to fetch ${symbol}: ${e.message}`);
            // If we get blocked entirely, wait longer
            await sleep(10000); 
        }
        
        // Very conservative sleep to avoid 403 blocks
        await sleep(2000);
    }
    
    console.log(`\nFinished! Successfully classified ${classified} stocks. Failed: ${failed}`);
    await pool.end();
}

run().catch(console.error);
