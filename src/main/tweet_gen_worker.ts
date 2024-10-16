import dotenv from 'dotenv'
import _isEmpty from 'lodash/isEmpty'
import { Signale } from 'signale'
import { callOpenAiApi, loadTemplate, promptUser } from '../lib'
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
    const TWITTER_API_KEY = await getEnvVar('TWITTER_API_KEY', 'Enter the Twitter API key:')
    const TWITTER_API_SECRET = await getEnvVar('TWITTER_API_SECRET', 'Enter the Twitter API secret:')
    const TWITTER_ACCESS_TOKEN = await getEnvVar('TWITTER_ACCESS_TOKEN', 'Enter the Twitter access token:')
    const TWITTER_ACCESS_TOKEN_SECRET = await getEnvVar('TWITTER_ACCESS_TOKEN_SECRET', 'Enter the Twitter access token secret:')

    const twitterClient = new Twitter({
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET
    })

    const tweetGeneratorTemplate = loadTemplate('tweet_generator.hbs')
    const tweetTemplate = loadTemplate('tweet.hbs')
    const tweetHashtagsGeneratorTemplate = loadTemplate('tweet_hashtags_generator.hbs')

    const accountInformation = await getEnvVar('ACCOUNT_INFORMATION', 'Describe the account:')
    const hashtagContent = await getEnvVar('HASHTAG_CONTENT', 'Enter hashtags:')

    l.star('Generating tweet...')

    const tweetContent = await callOpenAiApi(tweetGeneratorTemplate({ accountInformation, hashtags: hashtagContent }), 'gpt-4o-mini')

    l.star('Generating hashtags...')

    const hashtags = await callOpenAiApi(tweetHashtagsGeneratorTemplate({ content: tweetContent, hashtagSuggestions: hashtagContent }))
    const finalTweetContent = tweetTemplate({ content: tweetContent, hashtags })
    const confirmation = await promptUser(`Tweet the following content?\n\n${finalTweetContent}\n(yes/no) `)

    if (confirmation.toLowerCase()[0] === 'y') {
        await twitterClient.v2.tweet(finalTweetContent)
    }
}

run().catch((err: any): void => {
    l.error(err?.message ?? err)
}).then((): void => {
    l.star('Terminated.')
})
