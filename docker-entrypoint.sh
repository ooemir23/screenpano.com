#!/bin/sh
# Konteyner root yerine node kullanıcısıyla çalışır. /data volume'ü eskiden root sahipliğinde
# oluşturulmuş olabilir (Dokploy): root başlangıçta sahipliği düzeltir, sonra su-exec ile düşer.
set -e
mkdir -p /data
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data || true
  exec su-exec node:node "$@"
fi
exec "$@"
