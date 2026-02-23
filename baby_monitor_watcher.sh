#!/bin/bash

LOG_FILE="$HOME/.openclaw/workspace/baby_monitor.log"
COOLDOWN=120 # 2 minutes cooldown
LAST_TRIGGER=0

# Ensure log file exists
touch "$LOG_FILE"

echo "Watching $LOG_FILE for movement requests..."

# Follow the log file
tail -F -n 0 "$LOG_FILE" | while read line; do
    if [[ "$line" == *"MOVEMENT -> REQUEST:"* ]]; then
        NOW=$(date +%s)
        # Check cooldown
        if [ -z "$LAST_TRIGGER" ]; then LAST_TRIGGER=0; fi
        DIFF=$((NOW - LAST_TRIGGER))
        
        if [ $DIFF -ge $COOLDOWN ]; then
            # Extract prompt
            PROMPT=$(echo "$line" | sed 's/.*REQUEST: //')
            echo "[$(date)] Baby moved! Request: $PROMPT"
            
            # 1. Close existing YouTube tabs (Chrome)
            osascript -e '
            tell application "Google Chrome"
                set windowList to every window
                repeat with aWindow in windowList
                    set tabList to every tab of aWindow
                    repeat with aTab in tabList
                        if URL of aTab contains "youtube.com" then
                            close aTab
                        end if
                    end repeat
                end repeat
            end tell'
            
            # 2. Search and play new video
            QUERY=$(echo "$PROMPT" | sed 's/ /+/g')
            # Simple open search for reliability
            open "https://www.youtube.com/results?search_query=$QUERY"
            
            # 3. Try to fullscreen (optional/best-effort)
            sleep 4
            osascript -e 'tell application "Google Chrome" to activate' \
                      -e 'tell application "System Events" to keystroke "f"'
            
            LAST_TRIGGER=$NOW
        else
            echo "[$(date)] Movement ignored (Cooldown: $((COOLDOWN - DIFF))s remaining)"
        fi
    fi
done
