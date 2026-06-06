export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        await requireAuth(request);

        const body = await request.json();
        const { type } = body;

        if (!type || !['reel', 'post'].includes(type)) {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 });
        }

        let prompt = '';

        if (type === 'reel') {
            prompt = `Act as an expert Instagram Social Media Manager. I am posting a short-form vertical video (Reel).
Write a viral, highly engaging caption. 
The caption should include:
1. A hook in the first sentence to grab attention.
2. Short, punchy sentences.
3. Good use of emojis.
4. A clear Call To Action (CTA) asking people to comment or save the reel.
5. Exactly 8-12 highly relevant and trending hashtags separated by spaces at the very bottom.
Do not wrap the caption in quotes. Just return the raw text.`;
        } else if (type === 'post') {
            prompt = `Act as an expert Instagram Social Media Manager. I am posting an image.
Write a captivating caption.
The caption should include:
1. An engaging opening thought.
2. A small story or descriptive context.
3. Good use of emojis.
4. A clear Call To Action (CTA) asking people to double-tap, comment, or tag a friend.
5. Exactly 8-12 highly relevant and trending hashtags separated by spaces at the very bottom.
Do not wrap the caption in quotes. Just return the raw text.`;
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
        const captionText = data?.choices?.[0]?.message?.content || '';

        console.log('[GROQ GENERATED]', captionText);

        return NextResponse.json({ caption: captionText.trim() });

    } catch (error: any) {
        console.error('AI Instagram Caption Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to generate caption' },
            { status: 500 }
        );
    }
}
