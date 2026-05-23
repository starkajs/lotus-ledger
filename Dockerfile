FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY ./app/db /app/app/db
COPY ./drizzle /app/drizzle
COPY ./drizzle.config.ts /app/drizzle.config.ts
COPY ./scripts/db-migrate.mjs ./scripts/check-drizzle-migrations.mjs /app/scripts/
WORKDIR /app
CMD ["npm", "run", "start"]
