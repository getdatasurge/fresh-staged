#!/bin/bash
input=$(cat)

CONTEXT_WINDOW_CONTEXT_WINDOW_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size')
CONTEXT_WINDOW_USED_PERCENTAGE=$(echo "$input" | jq -r '.context_window.used_percentage // 0 | floor')
CONTEXT_WINDOW_REMAINING_PERCENTAGE=$(echo "$input" | jq -r '.context_window.remaining_percentage')
COST_TOTAL_COST_USD=$(echo "$input" | jq -r '.cost.total_cost_usd // 0 | . * 100 | floor / 100 | tostring | if . | contains(".") then . else . + ".00" end | if (. | split(".")[1] | length) == 1 then . + "0" else . end')
COST_TOTAL_API_DURATION_MS=$(echo "$input" | jq -r '.cost.total_api_duration_ms')
COST_TOTAL_LINES_ADDED=$(echo "$input" | jq -r '.cost.total_lines_added')
COST_TOTAL_LINES_REMOVED=$(echo "$input" | jq -r '.cost.total_lines_removed')
MODEL_ID=$(echo "$input" | jq -r '.model.id')
MODEL_DISPLAY_NAME=$(echo "$input" | jq -r '.model.display_name')
CWD=$(echo "$input" | jq -r '.cwd')

# Extract mode information
BYPASS_PERMISSIONS=$(echo "$input" | jq -r '.session.bypass_permissions // false')
SESSION_MODE=$(echo "$input" | jq -r '.session.mode // "normal"')

# Show git branch if in a git repo
GIT_BRANCH=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    BRANCH=$(git branch --show-current 2>/dev/null)
    if [ -n "$BRANCH" ]; then
        GIT_BRANCH="$BRANCH"
    fi
fi

# Build mode string
MODE_STR=""
if [ "$BYPASS_PERMISSIONS" = "true" ]; then
    MODE_STR="BYPASS PERMISSIONS ON"
fi
if [ -n "$SESSION_MODE" ] && [ "$SESSION_MODE" != "normal" ] && [ "$SESSION_MODE" != "null" ]; then
    if [ -n "$MODE_STR" ]; then
        MODE_STR="$MODE_STR ($(echo "$SESSION_MODE" | tr '[:lower:]' '[:upper:]'))"
    else
        MODE_STR="$(echo "$SESSION_MODE" | tr '[:lower:]' '[:upper:]')"
    fi
fi

# Build status line
STATUSLINE="Window Size: $CONTEXT_WINDOW_CONTEXT_WINDOW_SIZE | Context used: ${CONTEXT_WINDOW_USED_PERCENTAGE}% | Remaining %: $CONTEXT_WINDOW_REMAINING_PERCENTAGE | Cost: \$${COST_TOTAL_COST_USD} | API Duration: $COST_TOTAL_API_DURATION_MS | +Lines: $COST_TOTAL_LINES_ADDED | -Lines: $COST_TOTAL_LINES_REMOVED | Model: $MODEL_DISPLAY_NAME | CWD: $CWD | Branch: $GIT_BRANCH"

# Append mode if present
if [ -n "$MODE_STR" ]; then
    echo "$STATUSLINE -- $MODE_STR"
else
    echo "$STATUSLINE"
fi
