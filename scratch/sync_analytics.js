const http = require('http');

function syncAnalytics() {
    console.log('=== SYNCING ANALYTICS ===');
    http.get('http://localhost:3000/api/fetch-analytics', (res) => {
        console.log('Status Code:', res.statusCode);
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                console.log('Sync Response:', JSON.stringify(JSON.parse(data), null, 2));
            } catch (e) {
                console.log('Raw Sync Response:', data);
            }
        });
    }).on('error', (err) => {
        console.error('Sync request failed:', err.message);
    });
}

syncAnalytics();
