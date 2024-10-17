#! /usr/bin/env bash

DIR=$(dirname "$0")/../
LOG_DIR="$DIR/logs"

if [ -z "$WORKER_CONFIG_PATH" ]; then
    echo "Error: WORKER_CONFIG_PATH is not set"
    exit 1
fi

export $(cat "$DIR/.env" | sed 's/=\(.*\)/="\1"/' | xargs -d '\n') && $(which node) "$DIR/dist/main/twitter_headless_search.js"
echo "Execution finished at $(date)" >> "$LOG_DIR/tweet_headless_search.exec.log"