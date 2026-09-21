FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Each process (scheduler / bot / publisher / analytics / server) shares this
# image; docker-compose.yml picks the command per service.
CMD ["node", "dist/pipeline/runScheduler.js"]
