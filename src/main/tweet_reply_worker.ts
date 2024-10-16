import dotenv from 'dotenv'
import { promises as fs } from 'fs'
import _isEmpty from 'lodash/isEmpty'
import { Signale } from 'signale'
import { promptUser } from '../lib'
import Twitter, { ETwitterStreamEvent } from 'twitter-api-v2'

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

    let workerConfigJSON: string
    try {
        workerConfigJSON = await fs.readFile(WORKER_CONFIG_PATH, 'utf-8')
    } catch (error) {
        l.error(`Worker config file does not exist at path: ${WORKER_CONFIG_PATH}`)
        return
    }
    const workerConfig = JSON.parse(workerConfigJSON)

    const {
        TWITTER_API_KEY,
        TWITTER_API_SECRET,
        TWITTER_BEARER_TOKEN,
        TWITTER_ACCESS_TOKEN,
        TWITTER_ACCESS_TOKEN_SECRET
    } = workerConfig

    const twitterClient = new Twitter(_isEmpty(TWITTER_BEARER_TOKEN) ? {
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_TOKEN_SECRET
    }: TWITTER_BEARER_TOKEN)

    l.star('fetching existing stream rules...')

    const rules = await twitterClient.v2.streamRules();

    if (rules.data?.length) {
        l.star('deleting existing stream rules...')

        await twitterClient.v2.updateStreamRules({
            delete: { ids: rules.data.map(rule => rule.id) },
        });
    }

    // Add our rules
    l.star('Updating stream rules...')

    await twitterClient.v2.updateStreamRules({
      add: [{ value: '(#programming AND (joke OR humour)) AND (-is:nullcast AND is:verified)' }],
    });

    l.star('Searching stream...')
    const stream = await twitterClient.v2.searchStream({
      'tweet.fields': ['referenced_tweets', 'author_id'],
      expansions: ['referenced_tweets.id'],
    });
    // Enable auto reconnect
    stream.autoReconnect = true;

    stream.on(ETwitterStreamEvent.Data, async tweet => {
      // Ignore RTs or self-sent tweets
      const isARt = tweet.data.referenced_tweets?.some(tweet => tweet.type === 'retweeted') ?? false;
      if (isARt || tweet.data.author_id === (await twitterClient.currentUserV2())?.data?.id) {
        return;
      }

      // Reply to tweet
      //   await twitterClient.v1.reply('Did you talk about JavaScript? love it!', tweet.data.id);
    });
}

run().catch((err: any): void => {
    l.error(err?.stack ?? err)
}).then((): void => {
    l.star('Terminated.')
})
