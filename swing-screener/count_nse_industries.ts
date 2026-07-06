import * as fs from 'fs';

async function count() {
    const csvUrls = [
        'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
        'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv',
        'https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv',
        'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'
    ];
    const industries = new Set<string>();
    
    for (const url of csvUrls) {
        const res = await fetch(url);
        const text = await res.text();
        const lines = text.trim().split('\n');
        
        const headers = lines[0].split(',').map(h => h.trim());
        const indIdx = headers.indexOf('Industry');
        if (indIdx === -1) continue;
        
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if (!parts) continue;
            let ind = parts[indIdx]?.replace(/^"|"$/g, '').trim();
            if (ind) industries.add(ind);
        }
    }
    console.log(`Total unique industries in NSE CSVs: ${industries.size}`);
    console.log(Array.from(industries).sort().join('\n'));
}

count();
