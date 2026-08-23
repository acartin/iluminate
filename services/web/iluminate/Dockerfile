FROM node:20-alpine AS deps
WORKDIR /app/services/web/iluminate
COPY services/web/iluminate/package.json services/web/iluminate/package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app/services/web/iluminate
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/services/web/iluminate/node_modules ./node_modules
COPY services/lighting-core /app/services/lighting-core
RUN cd /app/services/lighting-core && npm ci && npm run build
COPY services/web/iluminate .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/services/web/iluminate
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ILUMINATE_LIGHTING_CORE_MODULE=/app/services/lighting-core/dist/index.js
COPY --from=builder /app/services/lighting-core/dist /app/services/lighting-core/dist
COPY --from=builder /app/services/web/iluminate/package.json ./package.json
COPY --from=builder /app/services/web/iluminate/.next ./.next
COPY --from=builder /app/services/web/iluminate/public ./public
COPY --from=builder /app/services/web/iluminate/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
