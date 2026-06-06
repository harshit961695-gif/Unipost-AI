const http = require('http');

http.get('http://localhost:3000/api/dashboard/stats', (res) => {
    console.log('Status Code:', res.statusCode);
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
        } catch (e) {
            console.log('Raw response:', data);
        }
    });
}).on('error', (err) => {
    console.error('Request failed:', err.message);
});
