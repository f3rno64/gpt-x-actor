import dotenv from 'dotenv'
dotenv.config()
import PI from 'p-iteration'
import _isFinite from 'lodash/isFinite'
import Bluebird from 'bluebird'
import _isEmpty from 'lodash/isEmpty'
import { Builder, By, until, WebDriver } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome'
import { callOpenAiApi, loadTemplate, promptUser } from '../lib'

const {
  QUERY = '',
  TWITTER_PASSWORD = '',
  TWITTER_USERNAME = '',
  TWITTER_EMAIL = '',
  ACCOUNT_INFORMATION = ''
} = process.env
const WAIT_DELAY_MS = 1000000000

const run = async (): Promise<void> => {
  // Initialize WebDriver
  const options = new chrome.Options()
  // options.addArguments('--headless');
  options.addArguments('--disable-gpu')
  options.addArguments('--no-sandbox')
  options.addArguments('--disable-dev-shm-usage')

  const driver: WebDriver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build()

  try {
    console.log('Navigating to login page...')
    await driver.get('https://x.com/login')

    console.log('Waiting for login button...')
    await driver.wait(
      until.elementLocated(
        By.js(() => {
          // eslint-disable-next-line
          // @ts-ignore
          return document.querySelectorAll('button[role="button"]')[3]
        })
      )
    )

    console.log('Clicking login button...')
    const loginButton = await driver.findElement(
      By.js(() => {
        // eslint-disable-next-line
        // @ts-ignore
        return document.querySelectorAll('button[role="button"]')[3]
      })
    )
    await loginButton.click()

    console.log('Waiting for username input...')
    await driver.wait(
      until.elementLocated(By.css('input[type="text"]')),
      WAIT_DELAY_MS
    )
    console.log('Found username input!')

    console.log(`Entering username: ${TWITTER_USERNAME}`)
    const usernameField = await driver.findElement(
      By.css('input[autocomplete="username"]')
    )
    await usernameField.click()
    await usernameField.sendKeys(TWITTER_USERNAME)

    console.log('Clicking the button...')
    const button = await driver.findElement(
      By.js(() => {
        // eslint-disable-next-line
        // @ts-ignore
        return document.querySelectorAll('button[role="button"]')[3]
      })
    )
    await button.click()

    console.log('Waiting for password field to load...')
    await driver.wait(
      until.elementLocated(By.css('input[type="password"]')),
      WAIT_DELAY_MS
    )
    console.log('Password field loaded!')

    console.log('Entering password...')
    const passwordField = await driver.findElement(
      By.css('input[type="password"]')
    )
    await passwordField.click()
    await passwordField.sendKeys(TWITTER_PASSWORD)

    console.log('Clicking the login button...')
    const loginButtonAfterPassword = await driver.findElement(
      By.js(() => {
        // eslint-disable-next-line
        // @ts-ignore
        return document.querySelectorAll('button[role="button"]')[4]
      })
    )
    await loginButtonAfterPassword.click()

    console.log('Waiting for email field to load...')
    await driver.wait(
      until.elementLocated(By.css('input[type="text"]')),
      WAIT_DELAY_MS
    )
    console.log('email field loaded!')

    console.log('Entering email...')
    const emailField = await driver.findElement(By.css('input[type="text"]'))
    await emailField.clear()
    await emailField.sendKeys(TWITTER_EMAIL)

    console.log('Waiting for search input field to load...')
    await driver.wait(
      until.elementLocated(
        By.css('input[data-testid="SearchBox_Search_Input"]')
      ),
      WAIT_DELAY_MS
    )
    console.log('Search input field loaded!')

    const searchUrl = `https://x.com/search?q=${encodeURIComponent(QUERY)}&src=typeahead_click`

    console.log(`Navigating to search URL: ${searchUrl}`)
    await driver.get(searchUrl)

    console.log('Waiting for search results to load...')
    await driver.wait(
      until.elementLocated(By.css('div[data-testid="primaryColumn"]')),
      WAIT_DELAY_MS
    )
    console.log('Search results loaded!')

    console.log('Clicking the latest button...')
    const latestButton = await driver.findElement(
      By.css('div[data-testid="ScrollSnap-List"] a[tabindex="-1"]')
    )
    await latestButton.click()

    await Bluebird.delay(3000)

    console.log('Extracting text from search results...')
    const searchResults = await PI.map(
      await driver.findElements(
        By.css('div[aria-label="Timeline: Search timeline"] > div > div')
      ),
      async (r): Promise<string> => await r.getText()
    )
    console.log(searchResults)
    const results = (
      await PI.mapSeries(searchResults, async (text, i: number) => {
        await driver.get(searchUrl)

        try {
          await driver.wait(
            until.elementLocated(
              By.css(
                `div[aria-label="Timeline: Search timeline"] > div > *:nth-child(${i + 1})`
              )
            )
          )

          // if (Math.random() < 0.2) {
          //   await driver.findElement(By.css(`div[aria-label="Timeline: Search timeline"] > div > *:nth-child(${i + 1}) button[aria-label="1 repost. Repost"]`)).click()
          //   await Bluebird.delay(500)
          // }

          const el = await driver.findElement(
            By.css(
              `div[aria-label="Timeline: Search timeline"] > div > *:nth-child(${i + 1})`
            )
          )
          await driver.executeScript('arguments[0].scrollIntoView(true);', el)
          await Bluebird.delay(500)

          await el.click()
          await Bluebird.delay(500)

          // Copy the location URL
          const currentUrl = await driver.getCurrentUrl()
          const currentURLParts = currentUrl.split('/')

          // Extract the tweet ID
          const idLikeURLParts = currentURLParts
            .filter((p) => _isFinite(+p) && p.length >= 10)
            .map((p) => +p)
          idLikeURLParts.sort(
            (a: number, b: number) => `${b}`.length - `${a}`.length
          )
          const tweetId = idLikeURLParts[0]
          if (!tweetId) {
            return
          }

          console.log(`Tweet ID: ${tweetId}`)

          const queryTweetRepliesPromptTemplate = loadTemplate(
            'query_tweet_replies.prompt.hbs'
          )
          const queryTweetRepliesPrompt = queryTweetRepliesPromptTemplate({
            accountInformation: ACCOUNT_INFORMATION,
            recentTweets: [],
            tweet: text
          })

          const response = await callOpenAiApi(
            queryTweetRepliesPrompt,
            'gpt-4o-mini'
          )

          await Bluebird.delay(5000)

          if (_isEmpty(response)) {
            return null
          }

          console.log(`Suggested response: \n\n${response}`)
          await promptUser('Press enter to continue...')
          const closeButton = await driver.findElement(
            By.css('button[aria-label="Close"]')
          )
          const backButton = await driver.findElement(
            By.css('button[aria-label="Back"]')
          )

          if (await closeButton.isDisplayed()) {
            await closeButton.click()
          } else {
            await backButton.click()
          }

          return { content: response, replyToId: tweetId }
        } catch (err) {
          console.error(err)
          return null
        }
      })
    ).filter(Boolean)

    console.log(JSON.stringify(results, null, 2))
  } finally {
    await Bluebird.delay(50000)
    console.log('Closing the browser...')
    // Close the browser
    await driver.quit()
  }
}

run().catch((err: any): void => {
  console.error(err?.stack ?? err)
})
