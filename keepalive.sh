#!/bin/bash
until node agent.js; do
    echo "Agent crashed with exit code $?. Respawning.." >&2
    sleep 1
done
