import dotenv from 'dotenv'
import { promises as fs } from 'fs'
import _isEmpty from 'lodash/isEmpty'
import { Signale } from 'signale'
import { callOpenAiApi, loadTemplate, loadDB, promptUser, saveDB } from '../lib'
import Twitter from 'twitter-api-v2'

dotenv.config()

const getEnvVar = async (key: string, promptMessage: string): Promise<string> => {
    const value = process.env[key]
    if (_isEmpty(value)) {
        return await promptUser(promptMessage)
    }
    return value as string
}

const l = new Signale({ scope: 'index' })

const run = async () => {
    const WORKER_CONFIG_PATH = await getEnvVar('WORKER_CONFIG_PATH', 'Enter the worker config file path:')

    l.star(`Started at ${new Date().toISOString()}: ${WORKER_CONFIG_PATH}`)

    const db = await loadDB()
    const { lastTweetedAtMs = 0 } = db
    const MIN_TWEET_INTERVAL_MS = await getEnvVar('MIN_TWEET_INTERVAL_MS', 'Enter the minimum tweet interval in milliseconds:')
    const currentTweetInterval = Date.now() - lastTweetedAtMs

    if (currentTweetInterval <= +MIN_TWEET_INTERVAL_MS) {
        l.star(`Minimum tweet interval not reached: ${currentTweetInterval}ms elapsed since ${new Date(lastTweetedAtMs).toISOString()}`)
        return
    }

    let workerConfigJSON: string
    try {
        workerConfigJSON = await fs.readFile(WORKER_CONFIG_PATH, 'utf-8')
    } catch (error) {
        l.error(`Worker config file does not exist at path: ${WORKER_CONFIG_PATH}`)
        return
    }
    const workerConfig = JSON.parse(workerConfigJSON)

    const {
        INSTRUCTIONS,
        ACCOUNT_INFORMATION,
        HASHTAG_SUGGESTIONS,
        TWITTER_API_KEY,
        TWITTER_API_SECRET,
        TWITTER_ACCESS_TOKEN,
        TWITTER_ACCESS_TOKEN_SECRET
    } = workerConfig

    if (_isEmpty(TWITTER_API_KEY)) {
        throw new Error('TWITTER_API_KEY is missing or empty in the worker config.')
    }

    if (_isEmpty(TWITTER_API_SECRET)) {
        throw new Error('TWITTER_API_SECRET is missing or empty in the worker config.')
    }

    if (_isEmpty(TWITTER_ACCESS_TOKEN)) {
        throw new Error('TWITTER_ACCESS_TOKEN is missing or empty in the worker config.')
    }

    if (_isEmpty(TWITTER_ACCESS_TOKEN_SECRET)) {
        throw new Error('TWITTER_ACCESS_TOKEN_SECRET is missing or empty in the worker config.')
    }

    const twitterClient = new Twitter({
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET
    })

    const tweetTemplate = loadTemplate('tweet.hbs')
    const tweetGeneratorTemplate = loadTemplate('tweet_generator.prompt.hbs')
    const tweetHashtagsGeneratorTemplate = loadTemplate('tweet_hashtags_generator.prompt.hbs')

    l.star('Generating tweet...')

    const tweetContent = await callOpenAiApi(tweetGeneratorTemplate({ accountInformation: ACCOUNT_INFORMATION, instructions: INSTRUCTIONS ?? false }), 'gpt-4o-mini')

    l.star('Generating hashtags...')

    const hashtags = await callOpenAiApi(tweetHashtagsGeneratorTemplate({ content: tweetContent, hashtagSuggestions: HASHTAG_SUGGESTIONS }))
    const finalTweetContent = tweetTemplate({ content: tweetContent, hashtags })

    await twitterClient.v2.tweet(finalTweetContent)
    db.lastTweetedAtMs = Date.now()
    await saveDB(db)

    l.star('Subscribing to live tweet firehose...')

    const stream = await twitterClient.v2.searchStream({
        'tweet.fields': ['author_id', 'conversation_id', 'created_at', 'text'],
        expansions: ['author_id']
    })

    stream.autoReconnect = true

    stream.on(ETwitterStreamEvent.Data, async (tweet) => {
        const { data } = tweet
        const { text, author_id } = data

        // Define your heuristic to determine if a tweet is desirable
        const isDesirable = (text: string): boolean => {
            // Example heuristic: reply to tweets containing the word "hello"
            return text.toLowerCase().includes('hello')
        }

        if (isDesirable(text)) {
            l.star(`Desirable tweet found from user ${author_id}: ${text}`)

            const replyContent = await callOpenAiApi(tweetGeneratorTemplate({ accountInformation: ACCOUNT_INFORMATION, instructions: `Reply to the tweet: "${text}"` }), 'gpt-4o-mini')

            await twitterClient.v2.reply(replyContent, data.id)
            l.star(`Replied to tweet ${data.id} with: ${replyContent}`)
        }
    })

    stream.on(ETwitterStreamEvent.Error, (error) => {
        l.error(`Stream error: ${error}`)
    })
}

run().catch((err: any): void => {
    l.error(err?.message ?? err)
}).then((): void => {
    l.star('Terminated.')
})
