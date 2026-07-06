import * as fs from 'fs';
import { Pool } from 'pg';
import { getParentSector } from './src/services/equialpha/sectorMapping';

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'stock_analysis',
    user: 'kesha',
    password: '',
});

async function downloadCSV(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    return response.text();
}

const csvUrls = [
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'
];

function parseCSV(csvText: string) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    // Header parsing
    const headers = lines[0].split(',').map(h => h.trim());
    const symbolIdx = headers.indexOf('Symbol');
    const industryIdx = headers.indexOf('Industry');
    
    if (symbolIdx === -1 || industryIdx === -1) return [];

    const records = [];
    for (let i = 1; i < lines.length; i++) {
        // Handling basic CSV parsing (assuming no commas in Symbol/Industry values)
        // If there are commas, a regex split is safer
        const rawLine = lines[i];
        
        // Simple regex to handle quoted fields containing commas
        const parts = [];
        let cur = '';
        let inQuotes = false;
        for (let j = 0; j < rawLine.length; j++) {
            if (rawLine[j] === '"') {
                inQuotes = !inQuotes;
            } else if (rawLine[j] === ',' && !inQuotes) {
                parts.push(cur);
                cur = '';
            } else {
                cur += rawLine[j];
            }
        }
        parts.push(cur);
        
        if (parts.length > Math.max(symbolIdx, industryIdx)) {
            records.push({
                Symbol: parts[symbolIdx].trim(),
                Industry: parts[industryIdx].trim()
            });
        }
    }
    return records;
}

async function repairSectors() {
    console.log('Starting sector repair...');
    const stockMap = new Map<string, { industry: string, sector: string }>();

    for (const url of csvUrls) {
        console.log(`Downloading ${url}...`);
        try {
            const csvText = await downloadCSV(url);
            const records = parseCSV(csvText);

            for (const record of records) {
                const symbol = record['Symbol'];
                const industry = record['Industry'];
                if (symbol && industry) {
                    const sector = getParentSector(industry);
                    stockMap.set(symbol, { industry, sector });
                }
            }
        } catch (e) {
            console.error(`Failed on ${url}:`, e);
        }
    }

    console.log(`Found mapping for ${stockMap.size} unique stocks. Updating database...`);

    let updatedCount = 0;
    for (const [symbol, { industry, sector }] of stockMap.entries()) {
        try {
            const res = await pool.query(
                `UPDATE ea_stock_universe SET industry = $1, sector = $2 WHERE symbol = $3 AND (sector = 'Others' OR industry = 'Unmapped')`,
                [industry, sector, symbol]
            );
            updatedCount += res.rowCount || 0;
        } catch (e) {
            console.error(`Failed to update ${symbol}:`, e);
        }
    }

    console.log(`Successfully updated ${updatedCount} stocks.`);
    await pool.end();
}

repairSectors().catch(console.error);
