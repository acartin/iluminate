FROM node:22-alpine AS build
WORKDIR /app
COPY services/render-worker/package.json services/render-worker/package-lock.json ./
RUN npm ci
COPY services/render-worker/tsconfig.json services/render-worker/worker.ts ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache chromium ffmpeg font-noto
ENV NODE_ENV=production
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/worker.js"]
