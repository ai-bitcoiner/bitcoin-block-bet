#!/bin/bash
set -e

APP_NAME="BabyMonitor"
BUILD_DIR="BabyMonitor.app"
CONTENTS_DIR="$BUILD_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "🧹 Cleaning..."
rm -rf "$BUILD_DIR"

echo "📂 Creating bundle structure..."
mkdir -p "$MACOS_DIR"
mkdir -p "$RESOURCES_DIR"

echo "📝 Copying Info.plist..."
cp BabyMonitor-Project/Info.plist "$CONTENTS_DIR/"

echo "🔨 Compiling Swift sources..."
swiftc -parse-as-library BabyMonitor-Project/Sources/*.swift -o "$MACOS_DIR/$APP_NAME" -target arm64-apple-macosx11.0

echo "✍️ Signing app..."
codesign --force --deep --sign - --entitlements BabyMonitor-Project/Info.plist "$BUILD_DIR"

echo "✅ Build complete: $BUILD_DIR"
echo "🚀 To run: open $BUILD_DIR"
