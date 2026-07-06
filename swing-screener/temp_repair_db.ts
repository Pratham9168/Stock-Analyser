import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { getParentSector } from './src/services/equialpha/sectorMapping';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_analysis',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function repairDB() {
  const urls = [
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'
  ];
  
  let updatedCount = 0;
  console.log('[Repair] Starting CSV-based sector enrichment...');
  
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.split('\n');
      
      // Process each line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = line.split(',');
        if (cols.length >= 3) {
          let industry = cols[1].replace(/^"|"$/g, '').trim();
          let symbol = cols[2].replace(/^"|"$/g, '').trim();
          
          if (symbol && industry) {
            const sector = getParentSector(industry);
            await pool.query(
              `UPDATE ea_stock_universe 
               SET industry = $1, sector = $2, updated_at = NOW() 
               WHERE symbol = $3`,
              [industry, sector, symbol]
            );
            updatedCount++;
          }
        }
      }
    } catch (e) {
      console.warn(`[Repair] Failed to process CSV ${url}:`, e);
    }
  }
  
  console.log(`[Repair] Complete! Updated ~${updatedCount} sector references.`);
  await pool.end();
}

repairDB().catch(console.error);
