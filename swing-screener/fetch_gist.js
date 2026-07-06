const https = require('https');
https.get('https://raw.githubusercontent.com/sahilrahman12/Price-Action-Trading/master/sectors.json', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(data.substring(0, 500)); });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
