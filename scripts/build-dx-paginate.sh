#!/bin/sh
# Rebuilds client/dx-paginate.js: Docxodus's read-only paginator for the browser.
# Too large for a Val file, so the page loads it from jsDelivr at a pinned commit
# of this repo, SRI-checked (DX_PAGINATE_URL / DX_PAGINATE_SRI in server/render.ts).
set -eu
cd "$(dirname "$0")/.."
deno bundle --platform browser --minify -o client/dx-paginate.js scripts/dx-paginate.entry.ts
printf 'sha384-%s\n' "$(openssl dgst -sha384 -binary client/dx-paginate.js | openssl base64 -A)"
