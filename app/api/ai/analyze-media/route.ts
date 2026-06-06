export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { promises as fsPromises } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Declare Next.js global non-webpack require variable to bypass Webpack bundling
declare var __non_webpack_require__: any;
const nextRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;

// Dynamically load ffmpeg-static at runtime to avoid Webpack path rewriting issues
let ffmpegStatic: string | null = null;
try {
    ffmpegStatic = nextRequire('ffmpeg-static');
} catch (e) {
    console.error('Failed to load ffmpeg-static dynamically:', e);
}

export const runtime = 'nodejs';
export const maxDuration = 60; // Extend duration limit to handle video processing

// Helper function to extract screenshots at intervals using ffmpeg/ffprobe
async function extractFrames(videoPath: string, outputDir: string, count: number = 5): Promise<string[]> {
    if (!ffmpegStatic) {
        throw new Error('ffmpeg-static binary not found');
    }

    const filePath = videoPath;
    console.log("[VIDEO PATH]", filePath);

    let duration = 0;
    let ffprobePath = '';
    
    try {
        const ffprobeStatic = nextRequire('ffprobe-static');
        ffprobePath = ffprobeStatic.path;
    } catch (e) {
        console.error('ffprobe-static is not available dynamically');
    }

    if (ffprobePath) {
        let stdout = '';
        let stderr = '';
        try {
            const cmd = `"${ffprobePath}" -v quiet -print_format json -show_format -show_streams "${filePath}"`;
            const result = await execPromise(cmd);
            stdout = result.stdout || '';
            stderr = result.stderr || '';
        } catch (err: any) {
            console.error('ffprobe execution failed:', err);
            stdout = err.stdout || '';
            stderr = err.stderr || '';
        }

        console.log("[FFPROBE RAW]", stdout);
        console.log("[FFPROBE STDERR]", stderr);

        // Format B: Try parsing JSON output
        if (stdout.trim()) {
            try {
                const data = JSON.parse(stdout);
                if (data?.format?.duration) {
                    duration = parseFloat(data.format.duration);
                    console.log(`Parsed Video Duration (Format B): ${duration} seconds`);
                }
            } catch (jsonErr) {
                console.error('Failed to parse ffprobe JSON output:', jsonErr);
            }
        }
        
        // Format A: Fallback to Regex on stdout/stderr
        if (duration === 0) {
            const combinedOutput = stdout + '\n' + stderr;
            const match = combinedOutput.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
            if (match) {
                const hours = parseInt(match[1], 10);
                const minutes = parseInt(match[2], 10);
                const seconds = parseFloat(match[3]);
                duration = hours * 3600 + minutes * 60 + seconds;
                console.log(`Parsed Video Duration (Format A): ${duration} seconds`);
            }
        }
    }

    // Secondary fallback using ffmpeg metadata output
    if (duration === 0) {
        let ffmpegOutput = '';
        try {
            console.log("[FFMPEG STATIC PATH]", ffmpegStatic);
            console.log("[FFMPEG PATH]", ffmpegStatic);
            await execPromise(`"${ffmpegStatic}" -i "${filePath}"`);
        } catch (err: any) {
            ffmpegOutput = err.stderr || '';
        }

        const match = ffmpegOutput.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const seconds = parseFloat(match[3]);
            duration = hours * 3600 + minutes * 60 + seconds;
            console.log(`Parsed Video Duration (ffmpeg fallback): ${duration} seconds`);
        }
    }

    // Ultimate fallback (duration = 0) to avoid crashing analysis
    if (duration === 0) {
        console.warn('Could not determine video duration. Falling back to duration = 0');
    }

    // 2. Extract frames at intervals
    const interval = duration / (count + 1);
    const framePaths: string[] = [];

    for (let i = 0; i < count; i++) {
        const time = (i + 1) * interval;
        const framePath = path.join(outputDir, `frame-${i + 1}.png`);
        console.log("[FFMPEG STATIC PATH]", ffmpegStatic);
        console.log("[FFMPEG PATH]", ffmpegStatic);
        const cmd = `"${ffmpegStatic}" -y -ss ${time.toFixed(3)} -i "${filePath}" -vframes 1 -vf scale=640:-2 "${framePath}"`;
        await execPromise(cmd);
        framePaths.push(framePath);
    }

    return framePaths;
}

export async function POST(request: NextRequest) {
    let videoFilePath = '';
    let framesDir = '';

    try {
        // Authenticate the user
        let user;
        if (process.env.BYPASS_AUTH_FOR_TESTING === 'true') {
            user = { id: 'test-user-id' };
        } else {
            user = await requireAuth(request);
        }
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 });
        }

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get('media') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No media file provided' }, { status: 400 });
        }

        const mimeType = file.type;
        const isVideo = mimeType.startsWith('video/');
        const isImage = mimeType.startsWith('image/');

        if (!isVideo && !isImage) {
            return NextResponse.json({ error: 'Unsupported media type. Upload JPG, PNG, WEBP, MP4, or MOV.' }, { status: 400 });
        }

        const inlineDataParts: any[] = [];
        const tempDir = path.join(process.cwd(), 'temp');
        await fsPromises.mkdir(tempDir, { recursive: true });

        if (isImage) {
            // Process Image directly
            const buffer = Buffer.from(await file.arrayBuffer());
            inlineDataParts.push({
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: mimeType
                }
            });
        } else {
            // Process Video: Save temporarily and extract key frames
            const buffer = Buffer.from(await file.arrayBuffer());
            const uniqueId = crypto.randomUUID();
            const fileExt = path.extname(file.name || '.mp4');
            videoFilePath = path.join(tempDir, `video_${uniqueId}${fileExt}`);
            framesDir = path.join(tempDir, `frames_${uniqueId}`);

            await fsPromises.mkdir(framesDir, { recursive: true });
            await fsPromises.writeFile(videoFilePath, buffer);

            // Extract frames
            const framePaths = await extractFrames(videoFilePath, framesDir, 5);
            
            if (framePaths.length === 0) {
                throw new Error('Failed to extract key frames from video file');
            }

            for (const framePath of framePaths) {
                const frameBuffer = await fsPromises.readFile(framePath);
                inlineDataParts.push({
                    inlineData: {
                        data: frameBuffer.toString('base64'),
                        mimeType: 'image/png'
                    }
                });
            }
        }

        // Formulate prompt
        const promptText = `
You are an expert Social Media Strategist and Multimodal AI.
Analyze the provided image(s) or video frames. Specifically analyze:
1. Objects (what items, products, or props are visible)
2. People (how many, expressions, clothing, demographics if discernible)
3. Environment (indoor, outdoor, nature, city, lighting, room type)
4. Activity (what actions are happening, movements, gestures)
5. Mood (energetic, serene, professional, casual, emotional vibe)
6. Colors (dominant color palettes, brand alignment hints)
7. Context (overall theme, message, industry context)

Based on this analysis, generate high-converting social media posts and copy.
Output your analysis and generation strictly as a single JSON object.
The JSON object must have exactly the following fields:
- media_summary: A concise 1-sentence description of the visual scene.
- detected_context: A detailed description of detected objects, people, environment, activity, mood, colors, and overall context.
- instagram_caption: An engaging caption optimized for Instagram (under 150 words) with a strong hook, emojis, and hashtags.
- facebook_caption: A conversational post optimized for Facebook (under 180 words) with a hook and clear CTA.
- linkedin_post: A professional, informative post optimized for LinkedIn (under 250 words) with paragraphs, insights, and CTAs.
- twitter_post: A punchy, highly engaging post optimized for X/Twitter (strictly under 280 characters).
- hashtags: A string list of 5-10 relevant trending hashtags.
- cta: A specific call to action (e.g. comment below, sign up, check the link).
- confidence_score: A number between 0.0 and 1.0 representing your confidence in this visual analysis.

Output ONLY the JSON object. Do not add any backticks or formatting, just raw JSON.
`;

        const contentParts: any[] = [
            {
                type: 'text',
                text: promptText
            }
        ];

        for (const part of inlineDataParts) {
            contentParts.push({
                type: 'image_url',
                image_url: {
                    url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                }
            });
        }

        const requestPayload = {
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                {
                    role: 'user',
                    content: contentParts
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2
        };

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('Groq Multimodal API Error:', errBody);
            throw new Error(`Groq API returned status ${response.status}`);
        }

        const resData = await response.json();
        const responseText = resData?.choices?.[0]?.message?.content;

        if (!responseText) {
            throw new Error('Groq returned an empty multimodal generation response');
        }

        const resultData = JSON.parse(responseText.trim());

        // Perform required logging
        console.log('[MEDIA ANALYSIS] File Name:', file.name, '| Size:', file.size, 'bytes | Mime Type:', file.type, '| Frames Analyzed:', inlineDataParts.length);
        console.log('[AI CONTEXT]\n', resultData.detected_context);
        console.log('[AI GENERATED CONTENT]\n', JSON.stringify({
            instagram: resultData.instagram_caption,
            facebook: resultData.facebook_caption,
            linkedin: resultData.linkedin_post,
            twitter: resultData.twitter_post,
            confidence: resultData.confidence_score
        }, null, 2));

        return NextResponse.json(resultData);

    } catch (error: any) {
        console.error('AI Media Intelligence API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to process and analyze media' },
            { status: 500 }
        );
    } finally {
        // Safe cleanup of temporary files in workspace CWD
        try {
            if (videoFilePath) {
                await fsPromises.unlink(videoFilePath).catch(() => {});
            }
            if (framesDir) {
                await fsPromises.rm(framesDir, { recursive: true, force: true }).catch(() => {});
            }
        } catch (cleanupErr) {
            console.error('Error cleaning up media temp files:', cleanupErr);
        }
    }
}
