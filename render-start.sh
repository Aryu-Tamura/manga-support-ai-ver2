#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="/opt/render/project/src"
STORAGE_ROOT="$PROJECT_ROOT/storage"
DATA_DIR="$STORAGE_ROOT/data"
UPLOADS_DIR="$STORAGE_ROOT/uploads"

cd "$PROJECT_ROOT"

mkdir -p "$DATA_DIR" "$UPLOADS_DIR"

if [ ! -f "$DATA_DIR/projects_index.json" ] && [ -d "Streamlit/data" ]; then
  cp -R "Streamlit/data/." "$DATA_DIR/"
fi

rm -rf "Streamlit/data" "tmp/uploads"
ln -s "$DATA_DIR" "Streamlit/data"
ln -s "$UPLOADS_DIR" "tmp/uploads"

npm run start
