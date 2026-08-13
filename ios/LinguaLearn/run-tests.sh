#!/usr/bin/env bash
set -euo pipefail

# Prefer booted iPhone simulator first, fallback to first available iPhone simulator
SIM_ID=$(xcrun simctl list devices | grep 'Booted' | grep 'iPhone' | head -1 | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/' || true)

if [ -z "$SIM_ID" ]; then
    SIM_ID=$(xcrun simctl list devices available | grep -v 'Unavailable' | grep 'iPhone' | head -1 | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/')
fi

if [ -z "$SIM_ID" ]; then
    echo "Error: No available iOS simulator found." >&2
    exit 1
fi

echo "Dynamically selected iOS Simulator ID: ${SIM_ID}"

cd "$(dirname "$0")"

xcodebuild test \
    -project LinguaLearn.xcodeproj \
    -scheme LinguaLearnContainerApp \
    -destination "platform=iOS Simulator,id=${SIM_ID}" \
    "$@"
