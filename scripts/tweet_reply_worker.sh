#! /usr/bin/env bash

DIR=$(dirname "$0")/../
LOG_DIR="$DIR/logs"

if [ -z "$WORKER_CONFIG_PATH" ]; then
    echo "Error: WORKER_CONFIG_PATH is not set"
    exit 1
fi

export $(cat "$DIR/.env" | xargs) && $(which node) "$DIR/dist/main/tweet_reply_worker.js"
echo "Execution finished at $(date)" >> "$LOG_DIR/tweet_reply_worker.exec.log"