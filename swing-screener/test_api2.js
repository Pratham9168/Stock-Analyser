const axios = require('axios');
async function test() {
  const res = await axios.get('https://www.nseindia.com/api/equity-stock?index=NIFTY%2050', {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*'
    }
  }).catch(e => e.response);
  if (res && res.data && res.data.data) {
     console.log('Success!', res.data.data.length);
  } else {
     console.log('Failed:', res?.status);
  }
}
test();
