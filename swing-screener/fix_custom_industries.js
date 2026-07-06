const fs = require('fs');
const content = fs.readFileSync('../next/next.js', 'utf8');

const regex = /key:\s*["']([^"']+)["'],\s*label:\s*["']([^"']+)["'][^]*?symbols:\s*\[(.*?)\]/g;
let match;
let count = 0;

console.log("BEGIN;");
console.log("UPDATE ea_stock_universe SET industry = 'Unmapped';");

while ((match = regex.exec(content)) !== null) {
   const label = match[2];
   if (label === 'Industry' || label === 'Sector') continue; // Skip generic labels
   const symbolsStr = match[3];
   const symbols = symbolsStr.split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean);
   if (symbols.length > 0) {
      const symbolsSql = symbols.map(s => `'${s}'`).join(',');
      console.log(`UPDATE ea_stock_universe SET industry = '${label.replace(/'/g, "''")}' WHERE symbol IN (${symbolsSql});`);
      count++;
   }
}
console.log("COMMIT;");
