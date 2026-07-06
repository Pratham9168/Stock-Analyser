const axios = require('axios');
async function test() {
  const res = await axios.get('https://www.nseindia.com/api/equity-stock?index=NIFTY%2050', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': '*/*'
    }
  }).catch(e => e.response);
  if (res && res.data) {
     console.log('Keys:', Object.keys(res.data));
     if (res.data.data) {
        console.log('Found data array:', res.data.data.length);
        console.log('Sample item:', Object.keys(res.data.data[1]));
     }
  } else {
     console.log('Failed:', res?.status);
  }
}
test();
