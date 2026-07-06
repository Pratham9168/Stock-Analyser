const fs = require('fs');
const content = fs.readFileSync('../next/next.js', 'utf8');

// The minified object looks like: {key:"foo",label:"Bar",...symbols:["A","B"]}
// Using a more permissive regex
const regex = /key:\s*["']([^"']+)["'],\s*label:\s*["']([^"']+)["'][^}]*?symbols:\s*\[(.*?)\]/g;
let match;
let count = 0;
while ((match = regex.exec(content)) !== null) {
   const key = match[1];
   const label = match[2];
   const symbolsStr = match[3];
   const symbols = symbolsStr.split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean);
   if (symbols.length > 0) {
      console.log(`Label: ${label}, Count: ${symbols.length}`);
      count++;
   }
}
console.log('Total extracted groups:', count);
