#!/usr/bin/env bash
# Serve Eddy's Hell Thursday admin app on port 8777
cd "$(dirname "$0")"
exec python3 -m http.server 8777 --bind 127.0.0.1
