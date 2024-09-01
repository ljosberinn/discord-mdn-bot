FROM node:20.12.2-slim AS deps

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY yarn.lock ./
COPY src ./src

RUN yarn install --frozen-lockfile
RUN npm run build

FROM node:20.12.2-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY yarn.lock ./
RUN yarn install --frozen-lockfile && rm -rf /usr/local/share/.cache
COPY --from=deps /app/build .

CMD ["node","index.js"]
