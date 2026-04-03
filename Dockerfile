# Binance Trading Bot Dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Create necessary directories
RUN mkdir -p logs data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose dashboard port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode!==200)throw new Error()})"

# Run the bot
CMD [ "npm", "start" ]