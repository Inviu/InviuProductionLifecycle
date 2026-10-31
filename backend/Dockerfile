# FlowForge backend
FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 5001

# Run pending migrations, then start the server.
CMD ["sh", "-c", "npm run migrate && node src/server.js"]
