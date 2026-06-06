export const aiService = {
    /**
     * Generate a social media caption or metadata using Groq (llama-3.3-70b-versatile)
     */
    async generateCaption(prompt: string, type?: 'title' | 'long_desc' | 'short_desc' | 'default'): Promise<{ caption: string; fallback: boolean; message?: string }> {
        const trimmedPrompt = prompt?.trim()

        // 1. Validation
        if (!trimmedPrompt) {
            return {
                caption: this.generateFallbackCaption(''),
                fallback: true,
                message: 'Empty prompt provided'
            }
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            console.error('[GROQ ERROR] GROQ_API_KEY is missing');
            return {
                caption: this.generateFallbackCaption(trimmedPrompt),
                fallback: true,
                message: 'Groq API key not configured'
            }
        }

        // 2. Formulate Prompt
        let fullPrompt = `Create an engaging social media caption for Instagram and YouTube based on this idea: ${trimmedPrompt}. Keep it concise, engaging, and under 220 characters.`
        if (type === 'title') {
            fullPrompt = `Generate a catchy YouTube video title based on this idea: ${trimmedPrompt}. Rules: Exactly 1 line, absolutely NO quotation marks, NO emojis.`
        } else if (type === 'long_desc') {
            fullPrompt = `Write a detailed YouTube video description based on this idea: ${trimmedPrompt}. Rules: Write approximately 150 words. Make it engaging and informative.`
        } else if (type === 'short_desc') {
            fullPrompt = `Write a short YouTube Shorts description based on this idea: ${trimmedPrompt}. Rules: Keep it strictly under 80 words. Make it punchy.`
        }

        const model = 'llama-3.3-70b-versatile';
        const requestBody = {
            model,
            messages: [
                { role: 'user', content: fullPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1024
        };

        // 3. Call Groq API with logs
        console.log('[GROQ REQUEST]', JSON.stringify(requestBody, null, 2));

        try {
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
                throw new Error(`Groq API returned ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const generatedText = data?.choices?.[0]?.message?.content || '';

            console.log('[GROQ GENERATED]', generatedText);

            if (!generatedText) {
                throw new Error('Empty response from Groq');
            }

            return { caption: generatedText.trim(), fallback: false };

        } catch (error: any) {
            console.error('[GROQ ERROR] AI Generation failed:', error.message || error);
            return {
                caption: this.generateFallbackCaption(trimmedPrompt),
                fallback: true,
                message: error.message || 'AI generation failed, using fallback'
            };
        }
    },

    /**
     * Deterministic fallback generator
     */
    generateFallbackCaption(prompt: string): string {
        if (!prompt) return "🚀 Exciting news! Stay tuned for more updates. #content #socialmedia"

        const words = prompt.split(/\s+/).slice(0, 10).join(' ')
        const emojis = ['✨', '🚀', '💫', '🌟', '🎯']
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)]

        return `${randomEmoji} ${words}... #content #socialmedia #update`
    }
}
