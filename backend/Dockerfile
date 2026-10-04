# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

# Not an npm package: the Intelligence Hub's video upload shells out to the real
# ffmpeg binary to pull a video's audio track out before it is transcribed.
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Drizzle reads the migration SQL at runtime and tsc does not copy non-TypeScript files.
COPY src/db/migrations ./src/db/migrations
COPY docker-entrypoint.sh ./

# No chown: `chown -R` over node_modules rewrites every file into a new layer and
# doubles the image. The application only ever reads these files.
RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
