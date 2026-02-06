#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Building frontend..."
npm run build

echo "Starting server..."
exec npm start
