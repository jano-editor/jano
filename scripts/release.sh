#!/bin/bash
set -e

PACKAGES=("plugin-types" "ui" "editor")

usage() {
  echo "Usage: ./scripts/release.sh <package> <version>"
  echo ""
  echo "Packages: ${PACKAGES[*]}"
  echo "Example:  ./scripts/release.sh plugin-types 1.0.0"
  exit 1
}

if [ -z "$1" ] || [ -z "$2" ]; then
  usage
fi

PACKAGE="$1"
VERSION="$2"

# validate package name
VALID=false
for p in "${PACKAGES[@]}"; do
  if [ "$p" = "$PACKAGE" ]; then
    VALID=true
    break
  fi
done

if [ "$VALID" = false ]; then
  echo "Error: unknown package '$PACKAGE'"
  echo "Valid packages: ${PACKAGES[*]}"
  exit 1
fi

# validate version format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-.+)?$ ]]; then
  echo "Error: version must be semver (e.g. 1.0.0 or 1.0.0-alpha.1)"
  exit 1
fi

# resolve package path
PACKAGE_DIR="packages/$PACKAGE"
PACKAGE_JSON="$PACKAGE_DIR/package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "Error: $PACKAGE_JSON not found"
  exit 1
fi

# read npm package name from package.json
NPM_NAME=$(node -e "console.log(require('./$PACKAGE_JSON').name)")
TAG_NAME="${PACKAGE}-v${VERSION}"

echo "Releasing $NPM_NAME v$VERSION"
echo "  Package: $PACKAGE_DIR"
echo "  Tag:     $TAG_NAME"
echo ""

# check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working directory not clean. Commit or stash changes first."
  exit 1
fi

# update version in package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Updated $PACKAGE_JSON to v$VERSION"

# commit and tag
git add "$PACKAGE_JSON"
git commit -m "release: $NPM_NAME v$VERSION"
git tag "$TAG_NAME"

echo "Created commit and tag: $TAG_NAME"

# load token from .env if available
if [ -z "$GH_TOKEN" ] && [ -f .env ]; then
  source .env
fi

# push
if [ -n "$GH_TOKEN" ]; then
  REMOTE="https://Flo0806:${GH_TOKEN}@github.com/jano-editor/jano.git"
  git push "$REMOTE" main
  git push "$REMOTE" "$TAG_NAME"
else
  git push origin main
  git push origin "$TAG_NAME"
fi

echo ""
echo "Done! GitHub Action will publish $NPM_NAME v$VERSION to npm."
