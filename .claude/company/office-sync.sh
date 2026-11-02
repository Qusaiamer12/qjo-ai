#!/bin/bash
# Wakes the manager when a shift pushes docs/company/office.json.
# Arg: the blob id last copied into the office.
cd /home/user/qjo-ai
last="$1"
for i in $(seq 1 360); do
  git fetch -q origin claude/gallant-thompson-9gjwdg 2>/dev/null
  now=$(git rev-parse FETCH_HEAD:docs/company/office.json 2>/dev/null)
  if [ -n "$now" ] && [ "$now" != "$last" ]; then echo "OFFICE $now"; git show FETCH_HEAD:docs/company/office.json; exit 0; fi
  sleep 45
done
echo "OFFICE unchanged for 4.5h"
