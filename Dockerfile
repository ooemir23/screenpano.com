FROM node:20-alpine
# ffmpeg: medya optimizasyonu ve takım logoları · chromium: trafik haritası
RUN apk add --no-cache ffmpeg chromium ttf-freefont
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache --virtual .build python3 make g++ \
 && npm ci --omit=dev \
 && apk del .build
COPY server ./server
COPY public ./public
COPY tools ./tools
ENV NODE_ENV=production DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "server/index.js"]
