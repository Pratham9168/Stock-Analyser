const fs = require('fs');
const content = fs.readFileSync('next.js', 'utf8');

// Look for React Router routes or path definitions
const regex = /path:\s*["']([^"']+)["']/g;
let match;
const paths = new Set();
while ((match = regex.exec(content)) !== null) {
   paths.add(match[1]);
}
console.log(`Found ${paths.size} unique paths.`);
console.log(Array.from(paths).join('\n'));
