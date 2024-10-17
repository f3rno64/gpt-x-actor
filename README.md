# GPT-X-Actor - 🤖 GPT Autonomous Actor for X (Twitter)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

**GPT-X-Actor** is a Node.js service that leverages OpenAI's GPT models to autonomously interact with X (formerly known as Twitter). It can:

- ✨ **Generate and Publish Tweets**: Creates tweets based on configurations and posts them via the X API.
- 🔁 **Automated Engagement**: Replies to tweets by analyzing search results and determining if a reply is warranted, using OpenAI's GPT models.

> NOTE: This repo is in a very early stage.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Setup](#setup)
- [Usage](#usage)
  - [Running the Tweet Generation Worker](#running-the-tweet-generation-worker)
  - [Running the Twitter Headless Search](#running-the-twitter-headless-search)
- [Configuration](#configuration)
  - [Global](#global)
  - [Worker](#worker)
- [Deployment](#deployment)
- [Development](#development)
- [Notes](#notes)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Automated Tweet Generation**: Uses OpenAI's GPT models to generate tweets based on predefined configurations, including account descriptions and suggested hashtags.
- **Automated Replies to Tweets**: Searches X.com for tweets based on specified queries, analyzes them using GPT to determine if a reply is warranted, and replies accordingly.
- **Selenium Integration**: Utilizes Selenium to automate browser interactions for functionalities not available through the X API.

---

## Architecture Overview

The project consists of two main components:

1. **Tweet Generation Worker**: Generates tweets using OpenAI's GPT models and publishes them via the X API.

2. **Twitter Headless Search**: Uses Selenium to automate a browser session to log into X.com, perform search queries, and interact with tweets based on GPT analysis.

Due to limitations in the X API (no free-tier access for certain functionalities), Selenium is used to simulate user interactions where necessary.

---

## Prerequisites

- **Node.js**: Version >=16.0.0 (**v23.0.0** is set in `.nvmrc` and recommended)
- **npm**: Version >=6.0.0
- **pnpm**: Installed globally (`npm install -g pnpm`)
- **OpenAI API Key**: Required for accessing OpenAI's GPT models.
- **X API Credentials**: Necessary for publishing tweets and interacting via the API.
- **Selenium WebDriver**: For automating browser interactions (e.g., ChromeDriver).
- **nvm**: Node Version Manager (optional, but recommended for managing Node.js versions).

---

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/f3rno64/gpt-x-actor.git
cd gpt-x-actor
```

## Setup

If you’re using nvm, switch to the required Node.js version:

```bash
nvm use
```

Install dependencies:

```bash
npm install -g npm
npm install -g pnpm
pnpm install
```

Build the Project:

```bash
pnpm build
```

## Usage

### Running the Tweet Generation Worker

The tweet generation worker generates tweets based on a specified configuration and publishes them via the X API.

To run the worker:

```bash
pnpm run:main:tweet-gen-worker
```

Alternatively, you can directly run the script:

```bash
ts-node -r dotenv/config src/main/tweet_gen_worker.ts
```

For configuration, see the [**Configuration - Worker**](#worker) section below.

### Running the Twitter Headless Search

This script uses Selenium to automate browser interactions with X.com, performing search queries and replying to tweets.

To run the script:

```bash
pnpm run:main:twitter-headless-search
```

Alternatively:

```bash
ts-node -r dotenv/config src/main/twitter_headless_search.ts
```

## Configuration

There are two levels of configuration available for the workers:

### Global

All values in `.env` are loaded first into `process.env` by the
[`dotenv`](https://www.npmjs.com/package/dotenv) library. These values are
overriden by any matching keys in the worker configuration.

### Worker

To ease worker operation when utilising multiple accounts, the account
credentials (API key, secret, optionally bearer, etc.) and all other environment
variables are provided as a JSON object in the configuration JSON within
[`worker_configs/`](./worker_configs/).

Therefore, something like the `OPENAI_API_KEY` can live in `.env`, whereas an X
accounts' credentials and prompt configuration might be in
`worker_configs/SomeXUsername-worker-role.json`.

For a tweet generator config such as `worker_configs/ParodyUser-joke.json` that
generates jokes for a parody account, the JSON might look like this:

```json
{
    "TWITTER_API_KEY": "...",
    "TWITTER_API_SECRET": "...",
    "TWITTER_ACCESS_TOKEN": "...",
    "TWITTER_ACCESS_TOKEN_SECRET": "...",
    "TWITTER_CLIENT_ID": "...",
    "TWITTER_CLIENT_SECRET": "...",
    "ACCOUNT_INFORMATION": "A parody account that writes jokes and generally too-funny content.",
    "INSTRUCTIONS": "Write a joke about something surprisingly relevant but yet mysteriously missing from our Zeitgeist.",
    "HASHTAG_SUGGESTIONS": "#unexpected #jokes #parody"
}
```

## Deployment

For continuous operation, you can schedule the scripts to run at intervals using cronjobs.

Scheduling with Cron

Add the following entry to your crontab to run the worker every 30 minutes:

```cron
*/30 * * * * sleep $((RANDOM % 120)); export WORKER_CONFIG_PATH=/opt/gpt-x-actor/worker_configs/your_worker_config.json && . /opt/gpt-x-actor/scripts/cron.env.sh && /opt/gpt-x-actor/scripts/tweet_gen_worker.sh >> /opt/gpt-x-actor/logs/tweet_gen_worker.log 2>&1
```

This cronjob:

- Runs every 30 minutes.
- Introduces a random sleep delay up to 2 minutes to avoid predictable patterns.
- Sets the `WORKER_CONFIG_PATH` environment variable to point to your worker configuration.
- Sources environment variables from cron.env.sh.
- Executes the worker script and logs output.

## Development

### Setting Up the Development Environment

Clone the repository:

```bash
git clone https://github.com/f3rno64/gpt-x-actor.git
cd gpt-x-actor
```

### Switch to the Correct Node Version

```bash
nvm use
```

Install dependencies:

```bash
pnpm install
```

Build the Project:

```bash
pnpm build
```

### Running Tests

Currently, test scripts are not specified, but you can add tests using Vitest.

#### Linting and Formatting

Lint code:

```bash
pnpm lint
```

Fix lint issues:

```bash
pnpm lint:fix
```

Format code:

```bash
pnpm format
```

### Notes

- Selenium Usage: Some functionalities are implemented using Selenium because X.com does not offer free-tier API access for those features.
- Ethical Considerations: Ensure that the usage of this tool complies with OpenAI’s and X.com’s terms of service and policies.
- Rate Limits: Be mindful of API rate limits when running the scripts to avoid being rate-limited or banned.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the Repository.
2. Create a Feature Branch:

```bash
git checkout -b feature/your-feature-name
```

3. Commit Your Changes:

```bash
git commit -m 'Add new feature'
```

4. Push to the Branch:

```bash
git push origin feature/your-feature-name
```

5. Open a Pull Request.

## License

This project is licensed under the MIT License - see the [`LICENSE.md`](/LICENSE.md) file for details.