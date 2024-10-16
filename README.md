# gpt-x-actor - GPT Autonomous Actor for X

> README & docs TODO

## Developing

```bash
nvm use
npm i -g npm
npm i -g pnpm
pnpm install
```

## Running

```bash
pnpm run:main:tweet-gen-worker
```

## Deploying

For now, cronjobs are the preferred way to schedule execution of the worker:

```
*/1 * * * * /path/to/project/scripts/tweet_gen_worker.sh
```