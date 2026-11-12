FROM node:20-alpine
# ffmpeg: medya optimizasyonu ve takım logoları · chromium: trafik haritası · su-exec: root başlangıçla /data sahipliğini düzeltip node'a düşmek için
RUN apk add --no-cache ffmpeg chromium ttf-freefont su-exec
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache --virtual .build python3 make g++ \
 && npm ci --omit=dev \
 && apk del .build
COPY server ./server
COPY public ./public
COPY tools ./tools
COPY docker-entrypoint.sh ./
ENV NODE_ENV=production DATA_DIR=/data
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
