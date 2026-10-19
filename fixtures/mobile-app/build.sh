#!/usr/bin/env bash
# Build Fixture Notes for the iOS simulator without an Xcode project: build/FixtureNotes.app
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build && mkdir -p build/FixtureNotes.app
arch=$(uname -m); [ "$arch" = arm64 ] || arch=x86_64
xcrun --sdk iphonesimulator swiftc -parse-as-library -O \
  -target "$arch-apple-ios17.0-simulator" -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  FixtureNotes.swift -o build/FixtureNotes.app/FixtureNotes
cp Info.plist build/FixtureNotes.app/Info.plist
codesign --force --sign - build/FixtureNotes.app >/dev/null 2>&1 || true
echo "built $(pwd)/build/FixtureNotes.app"
