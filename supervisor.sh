#!/bin/bash

# Configuration
WORKSPACE_DIR="$HOME/.openclaw/workspace"
APP_NAME="BabyMonitor"
APP_PATH="$WORKSPACE_DIR/BabyMonitor.app"
WATCHER_SCRIPT="baby_monitor_watcher.sh"
WATCHER_PATH="$WORKSPACE_DIR/$WATCHER_SCRIPT"
LOG_FILE="$WORKSPACE_DIR/supervisor.log"

log() {
    echo "$(date): $1" >> "$LOG_FILE"
}

# 1. Check/Start BabyMonitor App
if ! pgrep -f "$APP_NAME" > /dev/null; then
    log "BabyMonitor app not running. Attempting to start..."
    # We use 'open' to launch the app bundle properly
    open -g "$APP_PATH"
    if [ $? -eq 0 ]; then
        log "Started BabyMonitor.app"
    else
        log "Failed to start BabyMonitor.app"
    fi
else
    # App is running, good.
    :
fi

# 2. Check/Start Watcher Script
if ! pgrep -f "$WATCHER_SCRIPT" > /dev/null; then
    log "Watcher script not running. Attempting to start..."
    # Run in background, detached
    nohup "$WATCHER_PATH" >> "$WORKSPACE_DIR/watcher.log" 2>&1 &
    log "Started $WATCHER_SCRIPT with PID $!"
else
    # Watcher is running, good.
    :
fi

# 3. Check/Start Caffeinate (Keep Awake)
if ! pgrep -x "caffeinate" > /dev/null; then
    log "Caffeinate not running. Starting..."
    nohup caffeinate -d -i -m -u >> /dev/null 2>&1 &
    log "Started caffeinate"
fi
