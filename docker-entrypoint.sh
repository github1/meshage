#!/usr/bin/env sh
test ! -f './index.js' && echo 'console.log("hi"); process.exit(0);' > './index.js'
exec node ./index.js