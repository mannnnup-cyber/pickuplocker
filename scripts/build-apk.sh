#!/bin/bash
# Build PickupJamaica Kiosk v3.3 APK
# Strategy: Compile only our app classes against the old APK's classes.dex,
# then create a new DEX and inject it into the existing APK
#
# v3.3 adds: In-app update system (check, download, install APK from server)

set -e

BUILD_DIR="/tmp/apk-v3.3"
ANDROID_SDK="/home/z/android-sdk"
BUILD_TOOLS="$ANDROID_SDK/build-tools/33.0.2"
PLATFORM="$ANDROID_SDK/platforms/android-34/android.jar"
JAVA_HOME="/home/z/jdk-21.0.2"
PROJECT_DIR="/home/z/my-project/bare-android"
KEYSTORE="$PROJECT_DIR/app/pickup-jamaica.keystore"
KEYSTORE_PASS="pickup2024"
KEY_ALIAS="pickupjamaica"
OLD_APK="/home/z/my-project/bare-android/app/build/outputs/apk/release/app-release.apk"
OUTPUT_APK="/home/z/my-project/download/PickupJamaica-kiosk-v3.3.apk"

echo "=== Building PickupJamaica Kiosk v3.3 APK ==="

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{gen,classes,dex,apk_contents}

# Step 1: Build classpath from old APK's DEX + Android platform
echo "[1/6] Setting up classpath..."

# Extract old classes.dex from the previous APK
cd "$BUILD_DIR/apk_contents"
unzip -o "$OLD_APK" classes.dex -d . 2>/dev/null

# Find ALL runtime JARs from Gradle cache - both api and runtime
CLASSPATH="$PLATFORM"
for jar in $(find /home/z/.gradle/caches/transforms-3 -name "*.jar" 2>/dev/null); do
  case "$jar" in
    *api.jar|*runtime.jar)
      CLASSPATH="$CLASSPATH:$jar"
      ;;
  esac
done

# Also add the R.jar and merged jar
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
  public static final int VERSION_CODE = 7;
  public static final String VERSION_NAME = "3.3";
}
EOF

# Step 3: Compile Java sources
echo "[3/6] Compiling Java sources..."
find "$BUILD_DIR/gen" -name "*.java" > "$BUILD_DIR/sources.txt"
find "$PROJECT_DIR/app/src/main/java" -name "*.java" >> "$BUILD_DIR/sources.txt"

$JAVA_HOME/bin/javac \
  -source 11 -target 11 \
  -classpath "$CLASSPATH" \
  -d "$BUILD_DIR/classes" \
  @"$BUILD_DIR/sources.txt" 2>&1

echo "  Compiled successfully"

# Step 4: Convert to DEX
echo "[4/6] Converting to DEX..."
$BUILD_TOOLS/d8 \
  --release \
  --lib "$PLATFORM" \
  --output "$BUILD_DIR/dex" \
  $(find "$BUILD_DIR/classes" -name "*.class")

echo "  DEX created: $(ls -lh $BUILD_DIR/dex/classes.dex)"

# Step 5: Replace DEX in APK
echo "[5/6] Rebuilding APK..."
cd "$BUILD_DIR/apk_contents"
unzip -o "$OLD_APK" -d . 2>/dev/null

# Replace classes.dex with our new one
cp "$BUILD_DIR/dex/classes.dex" classes.dex

# Update assets (offline.html etc)
cp -r "$PROJECT_DIR/app/src/main/assets/"* assets/ 2>/dev/null || true

# Update the AndroidManifest.xml with new permissions
# (The manifest changes are already in the base APK's resources,
#  but we need to inject the updated one)
echo "  Injecting updated AndroidManifest.xml..."
MANIFEST_SRC="$PROJECT_DIR/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST_SRC" ]; then
  # Compile the manifest using aapt2
  $BUILD_TOOLS/aapt2 compile --dir "$PROJECT_DIR/app/src/main/res" -o "$BUILD_DIR/compiled_res.zip" 2>/dev/null || true

  # We'll use the binary manifest from the old APK as base,
  # and the new permissions will be added during the next Gradle build.
  # For the DEX-injection approach, manifest changes require a full Gradle build.
  echo "  NOTE: Manifest changes (new permissions) require a Gradle build."
  echo "  Run: cd bare-android && ./gradlew assembleRelease first."
fi

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
echo "Version: 3.3 (code 7)"
echo "New features: In-app update system"
echo ""
echo "IMPORTANT: This build includes new AndroidManifest permissions."
echo "If this is the first v3.3 build, you MUST do a full Gradle build first:"
echo "  cd $PROJECT_DIR && ./gradlew assembleRelease"
echo "Then re-run this script to inject the updated Java code."
