FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY package-lock.json* ./

# If package-lock exists we use `npm ci`, otherwise fallback to `npm install`.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev && npm cache clean --force; else npm install --omit=dev && npm cache clean --force; fi
# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
