export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { platform, type, context } = await request.json();
        // type: 'caption' | 'title' | 'description'
        // platform: 'facebook' | 'instagram' | 'youtube'
        // context: optional user-provided hint/topic

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 });
        }

        const prompts: Record<string, Record<string, string>> = {
            facebook: {
                caption: `You are a social media expert. Generate an engaging Facebook post caption${context ? ` about: "${context}"` : ''}. Make it conversational, include relevant emojis, and add 3-5 relevant hashtags at the end. Keep it under 200 words. Return ONLY the caption text, no explanations.`,
            },
            instagram: {
                caption: `You are an Instagram content creator. Generate a viral Instagram caption${context ? ` about: "${context}"` : ''}. Make it engaging with a strong hook, include emojis throughout, and add 15-20 trending hashtags at the end. Keep the caption under 150 words (before hashtags). Return ONLY the caption text, no explanations.`,
            },
            youtube: {
                title: `You are a YouTube SEO expert. Generate a click-worthy YouTube video title${context ? ` about: "${context}"` : ''}. Make it compelling, use power words, include numbers if relevant, and keep it under 70 characters. Return ONLY the title text, no explanations or quotes.`,
                description: `You are a YouTube content strategist. Generate a detailed YouTube video description${context ? ` about: "${context}"` : ''}. Include:
- A compelling opening paragraph (2-3 sentences)
- Key timestamps section (make up 4-5 relevant timestamps)
- A call to action (subscribe, like, comment)
- 5-8 relevant hashtags
Keep it under 300 words. Return ONLY the description text, no explanations.`,
            }
        };

        const prompt = prompts[platform]?.[type];
        if (!prompt) {
            return NextResponse.json({ error: `Unsupported platform/type: ${platform}/${type}` }, { status: 400 });
        }

        const model = 'llama-3.3-70b-versatile';
        const requestBody = {
            model,
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1024
        };

        console.log('[GROQ REQUEST]', JSON.stringify(requestBody, null, 2));

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('[GROQ RESPONSE] Status:', response.status);

        if (!response.ok) {
            const errText = await response.text();
            console.error('[GROQ RESPONSE] Error body:', errText);
            return NextResponse.json({ error: `Groq API returned ${response.status}: ${errText}` }, { status: 500 });
        }

        const data = await response.json();
        const generatedText = data?.choices?.[0]?.message?.content || '';

        console.log('[GROQ GENERATED]', generatedText);

        if (!generatedText) {
            throw new Error('No content generated');
        }

        console.log(`[AI Generate] Generated ${type} for ${platform}: ${generatedText.substring(0, 80)}...`);

        return NextResponse.json({ 
            success: true, 
            text: generatedText.trim(),
            platform,
            type 
        });

    } catch (error: any) {
        console.error('AI Generate Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate content' }, { status: 500 });
    }
}
