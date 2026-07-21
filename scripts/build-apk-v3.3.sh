#!/bin/bash
# Build PickupJamaica Kiosk v3.3 APK
# Full build with DEX injection + manifest update for in-app update system

set -e

BUILD_DIR="/tmp/apk-v3.3"
ANDROID_SDK="/home/z/android-sdk"
BUILD_TOOLS="$ANDROID_SDK/build-tools/34.0.0"
PLATFORM="$ANDROID_SDK/platforms/android-34/android.jar"
JAVA_HOME="/home/z/jdk-21"
PROJECT_DIR="/home/z/my-project/bare-android"
KEYSTORE="$PROJECT_DIR/app/pickup-jamaica.keystore"
KEYSTORE_PASS="pickup2024"
KEY_ALIAS="pickupjamaica"
OLD_APK="/home/z/my-project/bare-android/app/build/outputs/apk/release/app-release.apk"
OUTPUT_APK="/home/z/my-project/download/PickupJamaica-kiosk-v3.3.apk"

echo "=== Building PickupJamaica Kiosk v3.3 APK ==="

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{gen,classes,dex,apk_contents,manifest}

# Step 1: Build classpath
echo "[1/7] Setting up classpath..."

CLASSPATH="$PLATFORM"

# Add runtime JARs from Gradle cache
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
echo "[2/7] Generating BuildConfig..."
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
echo "[3/7] Compiling Java sources..."
find "$BUILD_DIR/gen" -name "*.java" > "$BUILD_DIR/sources.txt"
find "$PROJECT_DIR/app/src/main/java" -name "*.java" >> "$BUILD_DIR/sources.txt"

$JAVA_HOME/bin/javac \
  -source 11 -target 11 \
  -classpath "$CLASSPATH" \
  -d "$BUILD_DIR/classes" \
  -Xmaxerrs 20 \
  @"$BUILD_DIR/sources.txt" 2>&1

echo "  Compiled successfully"

# Step 4: Convert to DEX
echo "[4/7] Converting to DEX..."
$BUILD_TOOLS/d8 \
  --release \
  --lib "$PLATFORM" \
  --output "$BUILD_DIR/dex" \
  $(find "$BUILD_DIR/classes" -name "*.class")

echo "  DEX created: $(ls -lh $BUILD_DIR/dex/classes.dex)"

# Step 5: Compile new AndroidManifest.xml with aapt2
echo "[5/7] Compiling updated manifest..."

# Compile resources
$BUILD_TOOLS/aapt2 compile \
  --dir "$PROJECT_DIR/app/src/main/res" \
  -o "$BUILD_DIR/compiled_resources.zip" 2>&1 || true

# Link with new manifest - create a fresh APK with our manifest
$BUILD_TOOLS/aapt2 link \
  --proto-format \
  -o "$BUILD_DIR/base.apk" \
  -I "$PLATFORM" \
  --manifest "$PROJECT_DIR/app/src/main/AndroidManifest.xml" \
  --java "$BUILD_DIR/gen-r" \
  -R "$BUILD_DIR/compiled_resources.zip" \
  --auto-add-overlay \
  --version-code 7 \
  --version-name "3.3" 2>&1 || {
    echo "  WARNING: aapt2 link failed, using old manifest"
    echo "  New permissions will need a full Gradle build to take effect"
  }

# Step 6: Rebuild APK
echo "[6/7] Rebuilding APK..."
cd "$BUILD_DIR/apk_contents"
unzip -o "$OLD_APK" -d . 2>/dev/null

# Replace classes.dex with our new one
cp "$BUILD_DIR/dex/classes.dex" classes.dex

# Update assets (offline.html etc)
cp -r "$PROJECT_DIR/app/src/main/assets/"* assets/ 2>/dev/null || true

# Try to update the manifest if aapt2 link succeeded
if [ -f "$BUILD_DIR/base.apk" ]; then
  echo "  Injecting updated manifest..."
  # Extract the compiled manifest from the aapt2 output
  cd "$BUILD_DIR"
  mkdir -p base_apk_contents
  unzip -o "$BUILD_DIR/base.apk" -d base_apk_contents 2>/dev/null || true

  if [ -f "$BUILD_DIR/base_apk_contents/AndroidManifest.xml" ]; then
    cp "$BUILD_DIR/base_apk_contents/AndroidManifest.xml" "$BUILD_DIR/apk_contents/AndroidManifest.xml"
    echo "  Manifest updated with new permissions"
  fi
  cd "$BUILD_DIR/apk_contents"
fi

# Repackage
rm -f "$BUILD_DIR/app-unsigned.apk"
zip -r "$BUILD_DIR/app-unsigned.apk" . -q

# Step 7: Align and sign
echo "[7/7] Aligning and signing..."
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
echo "Permissions:"
$BUILD_TOOLS/aapt dump permissions "$OUTPUT_APK" 2>&1
echo ""
echo "Version: 3.3 (code 7)"
echo "New features: In-app update system (check, download, install APK from server)"
