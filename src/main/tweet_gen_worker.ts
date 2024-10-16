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
    l.star(`Started at ${new Date().toISOString()}`)

    const db = await loadDB()
    const { lastTweetedAtMs = 0 } = db
    const MIN_TWEET_INTERVAL_MS = await getEnvVar('MIN_TWEET_INTERVAL_MS', 'Enter the minimum tweet interval in milliseconds:')
    const currentTweetInterval = Date.now() - lastTweetedAtMs

    if (currentTweetInterval <= +MIN_TWEET_INTERVAL_MS) {
        l.star(`Minimum tweet interval not reached: ${currentTweetInterval}ms elapsed since ${new Date(lastTweetedAtMs).toISOString()}`)
        return
    }

    const WORKER_CONFIG_PATH = await getEnvVar('WORKER_CONFIG_PATH', 'Enter the worker config file path:')
    let workerConfigJSON: string
    try {
        workerConfigJSON = await fs.readFile(WORKER_CONFIG_PATH, 'utf-8')
    } catch (error) {
        l.error(`Worker config file does not exist at path: ${WORKER_CONFIG_PATH}`)
        return
    }
    const workerConfig = JSON.parse(workerConfigJSON)

    const {
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

    const tweetContent = await callOpenAiApi(tweetGeneratorTemplate({ accountInformation: ACCOUNT_INFORMATION, hashtags: HASHTAG_SUGGESTIONS }), 'gpt-4o-mini')

    l.star('Generating hashtags...')

    const hashtags = await callOpenAiApi(tweetHashtagsGeneratorTemplate({ content: tweetContent, hashtagSuggestions: HASHTAG_SUGGESTIONS }))
    const finalTweetContent = tweetTemplate({ content: tweetContent, hashtags })

    await twitterClient.v2.tweet(finalTweetContent)
    db.lastTweetedAtMs = Date.now()
    await saveDB(db)
}

run().catch((err: any): void => {
    l.error(err?.message ?? err)
}).then((): void => {
    l.star('Terminated.')
})
