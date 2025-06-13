#!/bin/bash
set -e

# Validate arguments
if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <binary_pattern> <base_name> <version>"
  exit 1
fi

PATTERN="$1"
BASE_NAME="$2"
VERSION="$3"

echo "Packaging $BASE_NAME version $VERSION"

# Create temporary directory for common files
COMMON_DIR="tmp-packaging"
if [ ! -d "$COMMON_DIR" ]; then
  echo "Missing common files directory: $COMMON_DIR"
  exit 1
fi

# Process each binary matching the pattern
for binary in $PATTERN; do
  [ ! -f "$binary" ] && continue

  # Extract architecture from filename (remove gpx_warp10_ prefix and any extension)
  ARCH="${binary#gpx_warp10_}"
  ARCH="${ARCH%.*}"  # Remove .exe for Windows

  PACKAGE_NAME="${BASE_NAME}-${VERSION}.${ARCH}"
  echo "Creating package $PACKAGE_NAME for $binary"

  # Create package directory structure
  mkdir -p "$PACKAGE_NAME"

  # Copy common files
  cp -r "$COMMON_DIR"/* "$PACKAGE_NAME/"

  # Copy the binary (preserve executable permissions)
  cp -p "$binary" "$PACKAGE_NAME/"

  # Create zip archive
  echo "Creating ${PACKAGE_NAME}.zip"
  (cd "$PACKAGE_NAME" && zip -qr "../${PACKAGE_NAME}.zip" .)

  # Generate SHA1 checksum
  echo "Generating checksum"
  sha1sum "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.zip.sha1"

  # Verify checksum
  if ! sha1sum -c "${PACKAGE_NAME}.zip.sha1"; then
    echo "Checksum verification failed"
    exit 1
  fi

  # Clean up
  rm -rf "$PACKAGE_NAME"
  echo "Created ${PACKAGE_NAME}.zip with checksum"
done

# Clean up temporary files
rm -rf "$COMMON_DIR"
echo "All packages created successfully"
