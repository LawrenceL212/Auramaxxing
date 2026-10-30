#!/bin/sh
# functions/ deploys on its own, so it carries copies of the app's pure modules.
# Run after editing reminders.js or streak.js; test/reminders.test.mjs fails if they drift.
set -e
cd "$(dirname "$0")/../.."
sed "s#'./streak.js'#'./streak.mjs'#" reminders.js > functions/lib/reminders.mjs
cp streak.js functions/lib/streak.mjs
