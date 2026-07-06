import * as fs from 'fs';
import * as path from 'path';
import { getParentSector } from './src/services/equialpha/sectorMapping';

async function testMappings() {
  const urls = [
    'https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv',
    'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'
  ];

  const industries = new Set<string>();

  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const lines = text.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        if (cols.length >= 2) {
          industries.add(cols[1].trim());
        }
      }
    } catch (e) {
      console.error('Error fetching ' + url, e);
    }
  }

  console.log(`Found ${industries.size} unique industries.`);
  const others = [];
  for (const ind of industries) {
    const parent = getParentSector(ind);
    if (parent === 'Others') {
      others.push(ind);
    }
  }
  console.log('Unmapped to parent (Others):', others);
}

testMappings();
