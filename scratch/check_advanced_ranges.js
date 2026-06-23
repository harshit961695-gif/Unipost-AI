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
    for (const range of ['7d', '30d', '90d']) {
      console.log(`\n--- RANGE: ${range} ---`);
      const data = await getUrl(`http://localhost:3000/api/analytics/advanced?range=${range}`);
      console.log(`hasData: ${data.hasData}, hasPosts: ${data.hasPosts}`);
      console.log(`postLogs length: ${data.postLogs?.length}`);
      console.log(`platforms:`, JSON.stringify(data.platforms, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

main();
