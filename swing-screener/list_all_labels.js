const fs = require('fs');
const content = fs.readFileSync('../next/next.js', 'utf8');
const regex = /label:\s*["']([^"']+)["']/g;
let match;
const labels = new Set();
while ((match = regex.exec(content)) !== null) {
   labels.add(match[1]);
}
console.log(`Found ${labels.size} unique labels.`);
console.log(Array.from(labels).join(', '));
