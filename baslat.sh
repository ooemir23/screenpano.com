#!/usr/bin/env bash
# Yerel çalıştırma: bağımlılıkları kurar, sunucuyu http://localhost:3000 adresinde başlatır.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js bulunamadı. Kurun: sudo apt install nodejs npm (en az sürüm 18)"; exit 1; fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then echo "Node.js $NODE_MAJOR çok eski, en az 18 gerekli."; exit 1; fi
[ -d node_modules ] || npm install
export PORT="${PORT:-3000}"
export SUPER_PASS="${SUPER_PASS:-admin12345}"
echo "Süper yönetici: kullanıcı admin, şifre $SUPER_PASS (yalnızca ilk açılışta ayarlanır)"
( sleep 2; command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT/login" >/dev/null 2>&1 ) &
exec node server/index.js
