#! /usr/bin/env bash

DIR=$(dirname "$0")
LOG_DIR="$DIR/logs"

if [ -z "$WORKER_CONFIG_PATH" ]; then
    echo "Error: WORKER_CONFIG_PATH is not set"
    exit 1
fi

export $(cat "$DIR/.env" | xargs) && $(which node) "$DIR/scripts/worker.sh"