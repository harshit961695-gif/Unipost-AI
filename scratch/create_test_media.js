const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function createMedia() {
    console.log('=== GENERATING TEST MEDIA ===');
    
    // Resolve ffmpeg path
    let ffmpegPath;
    try {
        ffmpegPath = require('ffmpeg-static');
        console.log('Resolved ffmpeg-static path:', ffmpegPath);
    } catch (err) {
        console.error('Failed to require ffmpeg-static:', err.message);
        console.log('Falling back to system ffmpeg');
        ffmpegPath = 'ffmpeg';
    }

    const videoPath = path.join(__dirname, '../scratch/test_video.mp4');
    const imagePath = path.join(__dirname, '../scratch/test_image.jpg');

    // Clean existing
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    try {
        console.log('Generating test JPEG...');
        execSync(`"${ffmpegPath}" -y -f lavfi -i color=c=blue:s=320x240:d=1 -vframes 1 "${imagePath}"`, { stdio: 'inherit' });
        console.log('Test JPEG created at:', imagePath);
    } catch (err) {
        console.error('Failed to create JPEG:', err.message);
    }

    try {
        console.log('Generating test MP4 (1 second, blue, yuv420p)...');
        execSync(`"${ffmpegPath}" -y -f lavfi -i color=c=blue:s=320x240:d=1 -f lavfi -i anullsrc -t 1 -pix_fmt yuv420p "${videoPath}"`, { stdio: 'inherit' });
        console.log('Test MP4 created at:', videoPath);
    } catch (err) {
        console.error('Failed to create MP4:', err.message);
    }
}

createMedia();
