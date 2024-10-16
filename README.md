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
*/30 * * * * sleep ${RANDOM:0:2}m; export WORKER_CONFIG_PATH=/opt/gpt-x-actor/worker_configs/WORKER_CONFIG_NAME.json && . /opt/gpt-x-actor/scripts/cron.env.sh && /opt/gpt-x-actor/scripts/WORKER.sh >> /opt/gpt-x-actor/logs/WORKER.log 2>&1
```