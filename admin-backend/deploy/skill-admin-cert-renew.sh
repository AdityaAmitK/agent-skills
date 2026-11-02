#!/bin/sh
if [ "$RENEWED_LINEAGE" = /etc/letsencrypt/live/t3-code.adityakinjawadekar.com ]; then
    nginx -t && systemctl reload nginx
fi
