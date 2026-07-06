const fs = require('fs');
const content = fs.readFileSync('next.js', 'utf8').toLowerCase();

const keywords = ['firebase', 'supabase', 'auth0', 'clerk', 'cognito', 'jwt', 'sessiontoken', 'jwt_secret', 'authorization: bearer'];

for (const k of keywords) {
    const idx = content.indexOf(k);
    if (idx !== -1) {
        console.log(`Found keyword: ${k}`);
        console.log(`Context: ${content.substring(Math.max(0, idx - 50), Math.min(content.length, idx + 50))}`);
    }
}
