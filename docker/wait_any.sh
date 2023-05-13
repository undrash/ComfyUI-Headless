#!/bin/sh

while true; do
  for pid in "$@"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      exit 0
    fi
  done
  sleep 1
done