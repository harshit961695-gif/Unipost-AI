const { fetchFacebookMetrics } = require('../lib/services/analyticsService');

async function main() {
  const postId = '957534230785131_122115147903286762';
  const pageId = '957534230785131';
  // Token from connected_accounts metadata page_access_token
  const token = 'EAAdsuzg8eWsBRh9i4YXHgNnfxWWwoSxEwCxZBu4ZAY5vzqR2Qx9O8AcWd6vUYdzxqwLb8mYKGc33Bb8iyNMFZAPeeRhahwEla3w96Y3M7ZBz5QNbnOIDV56fbouEYi2yii7KiTCSJMsZBnBsYE7xyyQXH4lr7e0ttp7e5rVon4HCO5cyRoqYFLdbhXZBJZCvASi2qW92To8';
  const userId = '1333698f-c998-4db5-b317-4b1adc42de31';

  console.log('Running test facebook analytics sync...');
  const res = await fetchFacebookMetrics(postId, token, pageId, userId);
  console.log('Result:', res);
}

main();
