import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import _isEmpty from 'lodash/isEmpty';
import { Signale } from 'signale';
import { promptUser, asyncWithRetry, OpenAIMessage, getResponseStructured } from '../lib';
import Twitter from 'twitter-api-v2';
import { z } from 'zod';

dotenv.config();

const getEnvVar = async (
    key: string,
    promptMessage: string
): Promise<string> => {
    const value = process.env[key];
    if (_isEmpty(value)) {
        return await promptUser(promptMessage);
    }
    return value as string;
};

const l = new Signale({ scope: 'asma_twitter' });

const run = async () => {
    const WORKER_CONFIG_PATH = await getEnvVar(
        'WORKER_CONFIG_PATH',
        'Enter the worker config file path:'
    );

    l.star(`Started at ${new Date().toISOString()}: ${WORKER_CONFIG_PATH}`);

    let workerConfigJSON: string;
    try {
        workerConfigJSON = await fs.readFile(WORKER_CONFIG_PATH, 'utf-8');
    } catch (error) {
        l.error(`Worker config file does not exist at path: ${WORKER_CONFIG_PATH}`);
        return;
    }
    const workerConfig = JSON.parse(workerConfigJSON);

    const {
        TWITTER_API_KEY,
        TWITTER_API_SECRET,
        TWITTER_ACCESS_TOKEN,
        TWITTER_ACCESS_TOKEN_SECRET
    } = workerConfig;

    if (_isEmpty(TWITTER_API_KEY)) {
        throw new Error('TWITTER_API_KEY is missing or empty in the worker config.');
    }

    if (_isEmpty(TWITTER_API_SECRET)) {
        throw new Error(
            'TWITTER_API_SECRET is missing or empty in the worker config.'
        );
    }

    if (_isEmpty(TWITTER_ACCESS_TOKEN)) {
        throw new Error(
            'TWITTER_ACCESS_TOKEN is missing or empty in the worker config.'
        );
    }

    if (_isEmpty(TWITTER_ACCESS_TOKEN_SECRET)) {
        throw new Error(
            'TWITTER_ACCESS_TOKEN_SECRET is missing or empty in the worker config.'
        );
    }

    const twitterClient = new Twitter({
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET
    });

    const { INSTRUCTIONS } = process.env
    const instructions = INSTRUCTIONS ?? (await promptUser('Enter the instructions for generating tweets:'))

    l.star('Generating tweets...');

    const responseSchema = z.object({
        tweets: z.array(z.object({
            content: z.string(),
            scheduledTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
                message: "Invalid date format"
            })
        })),
        usage: z.object({
            total_tokens: z.number()
        })
    });

    const systemPrompt = `
You are a social media assistant.
You will generate tweets based on the user's instructions.
Each tweet should have 'content' and 'scheduledTime' fields.
The 'content' field should contain the tweet text.
The 'scheduledTime' field should contain the time the tweet should be posted in ISO 8601 format.
`;

    const messages: OpenAIMessage[] = [{
        role: 'system',
        content: systemPrompt
    }, {
        role: 'user',
        content: instructions
    }];

    const response = await getResponseStructured<typeof responseSchema>(
        messages,
        'gpt-4o-mini',
        responseSchema,
        'response'
    );

    const { tweets, usage } = response as any;

    l.star(`Total cost for OpenAI query: ${usage.total_tokens} tokens`);

    for (const tweet of tweets) {
        const { content, scheduledTime } = tweet;
        const delay = new Date(scheduledTime).getTime() - Date.now();

        if (delay > 0) {
            l.star(`Scheduling tweet: "${content}" at ${new Date(scheduledTime).toISOString()}`);
            setTimeout(async () => {
                await asyncWithRetry(() => twitterClient.v2.tweet(content), 3, 5000);
                l.star(`Tweeted: "${content}"`);
            }, delay);
        } else {
            l.star(`Tweeting past-due tweet: "${content}"`);
            await asyncWithRetry(() => twitterClient.v2.tweet(content), 3, 5000);
            l.star(`Tweeted: "${content}"`);
        }
    }
};

run()
    .catch((err: any): void => {
        l.error(err?.message ?? err);
    })
    .then((): void => {
        l.star('Terminated.');
    });