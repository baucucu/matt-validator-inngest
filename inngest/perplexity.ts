import axios from 'axios';
import dotenv from 'dotenv';
import { inngest } from './client';

dotenv.config();

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

if (!PERPLEXITY_API_KEY) {
    throw new Error('Missing PERPLEXITY_API_KEY environment variable');
}

export interface PerplexityResponse {
    valid: boolean;
    reasoning: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    cached: boolean;
}

export interface CompanyValidationData {
    status: boolean;
    error: any | null;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    reasoning: string;
    cached: boolean;
}

const headers = {
    Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
    'Content-Type': 'application/json',
};

function createPrompt(company: string, requirements: string) {
    return [
        { role: 'system', content: 'Be precise and concise.' },
        {
            role: 'user',
            content: `Does company ${company} meet the following requirements: ${requirements}? Return JSON format WITHOUT MARKDOWN containing: { "valid": boolean, "reasoning": "concise explanation based on verifiable facts" }`,
        },
    ];
}

function extractJsonFromContent(content: string): PerplexityResponse | null {
    try {
        const direct = JSON.parse(content);
        if (isValidResponse(direct)) return direct;
    } catch {
        const match = content.match(/\{[^}]*"valid"[^}]*"reasoning"[^}]*\}/s);
        if (match) {
            try {
                const extracted = JSON.parse(match[0]);
                if (isValidResponse(extracted)) return extracted;
            } catch {
                // fall through
            }
        }
    }
    return null;
}

function isValidResponse(obj: any): obj is PerplexityResponse {
    return typeof obj?.valid === 'boolean' && typeof obj?.reasoning === 'string';
}

export async function validateCompany(company: string, requirements: string): Promise<CompanyValidationData> {
    try {
        const payload = {
            model: 'sonar',
            messages: createPrompt(company, requirements),
            max_tokens: 123,
            temperature: 0,
            top_p: 0.9,
            search_domain_filter: null,
            return_images: false,
            return_related_questions: false,
            search_recency_filter: 'year',
            top_k: 0,
            stream: false,
            presence_penalty: 0,
            frequency_penalty: 1,
        };

        const { data, status, statusText } = await axios.post(PERPLEXITY_API_URL, payload, { headers });

        if (status !== 200) {
            throw new Error(`API error: ${statusText}`);
        }

        const content = data?.choices?.[0]?.message?.content || '';
        const usage = data?.usage || {};
        console.log('Perplexity usage', { usage });
        const result = extractJsonFromContent(content);

        if (result) {
            return {
                status: result.valid,
                error: null,
                usage,
                reasoning: result.reasoning,
                cached: false,
            };
        }

        throw new Error('Invalid response format from Perplexity API');
    } catch (error) {
        console.error('Perplexity API error:', error);
        return {
            status: false,
            error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
            reasoning: `Error validating company: ${error instanceof Error ? error.message : 'Unknown error'}`,
            cached: false,
        };
    }
}
