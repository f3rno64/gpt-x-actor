#! /usr/bin/env bash

DIR=$(dirname 0)/..
LOG_DIR="$DIR/logs"

if [ -z "$WORKER_NAME" ]; then
    echo "Error: WORKER_NAME is not set"
    exit 1
fi

export $(cat "$DIR/.env" | xargs) && $(which node) "$DIR/dist/main/$WORKER_NAME.js"
*/1 * * * * (. "$DIR/scripts/cron.env.sh"; "$DIR/scripts/worker.sh" >> "$LOG_DIR/$WORKER_NAME.log"; )