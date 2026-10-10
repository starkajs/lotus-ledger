FROM node:22-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:22-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:22-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:22-alpine
ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
    SUPERCRONIC=supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=cd48d45c4b10f3f0bfdd3a57d054cd05ac96812b
RUN apk add --no-cache curl \
 && curl -fsSLO "$SUPERCRONIC_URL" \
 && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
 && chmod +x "$SUPERCRONIC" \
 && mv "$SUPERCRONIC" "/usr/local/bin/${SUPERCRONIC}" \
 && ln -s "/usr/local/bin/${SUPERCRONIC}" /usr/local/bin/supercronic

COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY ./app/db /app/app/db
COPY ./app/lib /app/app/lib
COPY ./drizzle /app/drizzle
COPY ./drizzle.config.ts /app/drizzle.config.ts
COPY ./tsconfig.json /app/tsconfig.json
COPY ./scripts/db-migrate.mjs ./scripts/check-drizzle-migrations.mjs ./scripts/sync-integrations-cron.ts /app/scripts/
COPY ./scripts/lib/integrations-cron-notify.ts /app/scripts/lib/
COPY ./crontab /app/crontab
WORKDIR /app
# The node user ships with the image. Legacy QuickBooks token files are
# ignored when .data is missing, so the process does not need to write here.
RUN chown -R node:node /app /home/node
ENV HOME=/home/node
USER node
CMD ["npm", "run", "start"]
