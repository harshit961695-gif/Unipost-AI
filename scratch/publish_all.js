const fs = require('fs');
const path = require('path');

async function publishAll() {
    console.log('=== STARTING MULTI-PLATFORM PUBLISHING ===');

    try {
        const videoBuffer = fs.readFileSync(path.join(__dirname, 'test_video.mp4'));
        const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

        const imageBuffer = fs.readFileSync(path.join(__dirname, 'test_image.jpg'));
        const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });

        const metadata = {
            facebook: {
                enabled: true,
                caption: 'Production Audit Test Post - Facebook ' + new Date().toISOString(),
                type: 'post'
            },
            instagram: {
                enabled: true,
                caption: 'Production Audit Test Post - Instagram ' + new Date().toISOString(),
                type: 'post'
            },
            youtube: {
                enabled: true,
                title: 'Audit Test YouTube ' + Date.now(),
                description: 'Test upload from production audit script.',
                privacy: 'private'
            }
        };

        const formData = new FormData();
        formData.append('metadata', JSON.stringify(metadata));
        formData.append('media_facebook', imageBlob, 'test_image.jpg');
        formData.append('media_instagram', imageBlob, 'test_image.jpg');
        formData.append('media_youtube', videoBlob, 'test_video.mp4');

        console.log('Sending unified publish request to /api/publish...');
        const response = await fetch('http://localhost:3000/api/publish', {
            method: 'POST',
            body: formData
        });

        console.log('Response Status:', response.status);
        const data = await response.json();
        console.log('Publish Response Data:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log('PUBLISHING SUCCESSFUL!');
        } else {
            console.error('PUBLISHING FAILED:', data.error);
        }
    } catch (err) {
        console.error('Error during publishing execution:', err);
    }
}

publishAll();
