const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function main() {
  const fullPostId = '957534230785131_122115147903286762';
  const token = 'EAAdsuzg8eWsBRh9i4YXHgNnfxWWwoSxEwCxZBu4ZAY5vzqR2Qx9O8AcWd6vUYdzxqwLb8mYKGc33Bb8iyNMFZAPeeRhahwEla3w96Y3M7ZBz5QNbnOIDV56fbouEYi2yii7KiTCSJMsZBnBsYE7xyyQXH4lr7e0ttp7e5rVon4HCO5cyRoqYFLdbhXZBJZCvASi2qW92To8';

  console.log('Running raw facebook API fallback request...');
  const url = `https://graph.facebook.com/v21.0/${fullPostId}?fields=id,message,created_time&access_token=${token}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log('HTTP Status:', res.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

main();
