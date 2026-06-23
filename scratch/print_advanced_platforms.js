const http = require('http');

async function getUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
  try {
    console.log('Fetching /api/analytics/advanced...');
    const data = await getUrl('http://localhost:3000/api/analytics/advanced');
    console.log('Keys in response:', Object.keys(data));
    console.log('platforms:', JSON.stringify(data.platforms, null, 2));
    console.log('platform_wise:', JSON.stringify(data.platform_wise, null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
