#!/bin/bash
# Build PickupJamaica Kiosk v3.4 APK
# 
# PREREQUISITES:
#   1. Run this on a machine where the v3.3 APK was successfully built with Gradle
#   2. The Gradle cache must be populated (i.e., you've run ./gradlew assembleRelease before)
#   3. The v3.3 APK must exist at the OLD_APK path
#
# This script uses the DEX-injection method:
#   1. Compile Java → .class files
#   2. Convert to DEX using d8
#   3. Inject new DEX into existing APK
#   4. Re-sign with the same keystore
#
# IMPORTANT: If the bare d8 approach fails (known bug with certain class hierarchies),
# fall back to a full Gradle build:
#   cd /home/z/my-project/bare-android && ./gradlew assembleRelease
# Then copy the APK from app/build/outputs/apk/release/app-release.apk

set -e

BUILD_DIR="/tmp/apk-v3.4"
ANDROID_SDK="${ANDROID_SDK_ROOT:-/home/z/android-sdk}"
BUILD_TOOLS="$ANDROID_SDK/build-tools/34.0.0"
PLATFORM="$ANDROID_SDK/platforms/android-34/android.jar"
JAVA_HOME="${JAVA_HOME:-/home/z/jdk-21}"
PROJECT_DIR="/home/z/my-project/bare-android"
KEYSTORE="$PROJECT_DIR/app/pickup-jamaica.keystore"
KEYSTORE_PASS="pickup2024"
KEY_ALIAS="pickupjamaica"
OLD_APK="$PROJECT_DIR/app/build/outputs/apk/release/app-release.apk"
OUTPUT_APK="/home/z/my-project/download/PickupJamaica-kiosk-v3.4.apk"

echo "=== Building PickupJamaica Kiosk v3.4 APK ==="
echo ""
echo "If this fails, run the full Gradle build instead:"
echo "  cd $PROJECT_DIR && ANDROID_SDK_ROOT=$ANDROID_SDK JAVA_HOME=$JAVA_HOME ./gradlew assembleRelease"
echo "  cp app/build/outputs/apk/release/app-release.apk $OUTPUT_APK"
echo ""

# Verify prerequisites
if [ ! -f "$OLD_APK" ]; then
  echo "ERROR: Old APK not found at $OLD_APK"
  echo "Run a full Gradle build first: cd $PROJECT_DIR && ./gradlew assembleRelease"
  exit 1
fi

if [ ! -f "$PLATFORM" ]; then
  echo "ERROR: Android platform JAR not found at $PLATFORM"
  echo "Install SDK: sdkmanager \"platforms;android-34\" \"build-tools;34.0.0\""
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{gen,classes,dex,apk_contents}

# Step 1: Build classpath
echo "[1/6] Setting up classpath..."

CLASSPATH="$PLATFORM"

# Add AndroidX JARs from local cache
ANDROIDX_DIR="$ANDROID_SDK/androidx"
if [ -d "$ANDROIDX_DIR" ]; then
  for jar in "$ANDROIDX_DIR"/*.jar; do
    CLASSPATH="$CLASSPATH:$jar"
  done
fi

# Add JARs from Gradle cache
for jar in $(find /home/z/.gradle/caches/transforms-3 -name "*.jar" 2>/dev/null); do
  case "$jar" in
    *api.jar|*runtime.jar)
      CLASSPATH="$CLASSPATH:$jar"
      ;;
  esac
done

# Add R.jar and merged jar from previous build
R_JAR="$PROJECT_DIR/app/build/intermediates/compile_and_runtime_not_namespaced_r_class_jar/release/R.jar"
MERGED_JAR="$PROJECT_DIR/app/build/intermediates/merged_java_res/release/base.jar"
[ -f "$R_JAR" ] && CLASSPATH="$CLASSPATH:$R_JAR"
[ -f "$MERGED_JAR" ] && CLASSPATH="$CLASSPATH:$MERGED_JAR"

echo "  Classpath has $(echo $CLASSPATH | tr ':' '\n' | wc -l) entries"

# Step 2: Generate BuildConfig.java
echo "[2/6] Generating BuildConfig..."
mkdir -p "$BUILD_DIR/gen/com/pickupjamaica/kiosk"
cat > "$BUILD_DIR/gen/com/pickupjamaica/kiosk/BuildConfig.java" << 'EOF'
package com.pickupjamaica.kiosk;
public final class BuildConfig {
  public static final boolean DEBUG = false;
  public static final String APPLICATION_ID = "com.pickupjamaica.kiosk";
  public static final String BUILD_TYPE = "release";
  public static final int VERSION_CODE = 8;
  public static final String VERSION_NAME = "3.4";
}
EOF

# Step 3: Compile Java sources
echo "[3/6] Compiling Java sources..."
find "$BUILD_DIR/gen" -name "*.java" > "$BUILD_DIR/sources.txt"
find "$PROJECT_DIR/app/src/main/java" -name "*.java" >> "$BUILD_DIR/sources.txt"

echo "  Sources: $(wc -l < "$BUILD_DIR/sources.txt") files"

$JAVA_HOME/bin/javac \
  -source 11 -target 11 \
  -classpath "$CLASSPATH" \
  -d "$BUILD_DIR/classes" \
  -Xmaxerrs 20 \
  @"$BUILD_DIR/sources.txt" 2>&1

echo "  Compiled successfully"

# Step 4: Convert to DEX
echo "[4/6] Converting to DEX..."

# Build classpath args for d8
CP_ARGS=""
if [ -d "$ANDROIDX_DIR" ]; then
  for jarF in "$ANDROIDX_DIR"/*.jar; do
    CP_ARGS="$CP_ARGS --classpath $jarF"
  done
fi

$BUILD_TOOLS/d8 \
  --release \
  --min-api 22 \
  --lib "$PLATFORM" \
  $CP_ARGS \
  --output "$BUILD_DIR/dex" \
  $(find "$BUILD_DIR/classes" -name "*.class") 2>&1

echo "  DEX created: $(ls -lh $BUILD_DIR/dex/classes.dex)"

# Step 5: Replace DEX in APK
echo "[5/6] Rebuilding APK..."
cd "$BUILD_DIR/apk_contents"
unzip -o "$OLD_APK" -d . 2>/dev/null

# Replace classes.dex with our new one
cp "$BUILD_DIR/dex/classes.dex" classes.dex

# Update assets
cp -r "$PROJECT_DIR/app/src/main/assets/"* assets/ 2>/dev/null || true

# Repackage
rm -f "$BUILD_DIR/app-unsigned.apk"
zip -r "$BUILD_DIR/app-unsigned.apk" . -q

# Step 6: Align and sign
echo "[6/6] Aligning and signing..."
$BUILD_TOOLS/zipalign -f 4 "$BUILD_DIR/app-unsigned.apk" "$BUILD_DIR/app-aligned.apk"

$BUILD_TOOLS/apksigner sign \
  --ks "$KEYSTORE" \
  --ks-pass "pass:$KEYSTORE_PASS" \
  --ks-key-alias "$KEY_ALIAS" \
  --key-pass "pass:$KEYSTORE_PASS" \
  --out "$OUTPUT_APK" \
  "$BUILD_DIR/app-aligned.apk"

echo ""
echo "=== BUILD SUCCESSFUL ==="
ls -lh "$OUTPUT_APK"
echo ""
$BUILD_TOOLS/aapt dump badging "$OUTPUT_APK" 2>&1 | head -5
echo ""
echo "Version: 3.4 (code 8)"
echo "Changes: Native timeout watchdog, rebuildWebView(), diagnostic logger,"
echo "         API 22 network compat, admin diagnostic tools"
