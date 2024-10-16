#! /usr/bin/env bash

DIR=$(dirname 0)/..
LOG_DIR="$DIR/logs"

if [ -z "$WORKER_NAME" ]; then
    echo "Error: WORKER_NAME is not set"
    exit 1
fi

export $(cat "$DIR/.env" | xargs) && $(which node) "$DIR/dist/main/$WORKER_NAME.js"