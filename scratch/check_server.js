const http = require('http');

http.get('http://localhost:3000/api/analytics/test', (res) => {
    console.log('Server is running! Status:', res.statusCode);
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
    console.error('Server is not running or failed to connect:', err.message);
});
