#!/bin/bash

# Binance Trading Bot Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
CONFIG_FILE=".env.${ENVIRONMENT}"

echo "🚀 Deploying Binance Trading Bot ($ENVIRONMENT environment)"

# Check if configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file $CONFIG_FILE not found"
    echo "Please create it from .env.example"
    exit 1
fi

# Load environment variables
echo "📋 Loading environment variables from $CONFIG_FILE"
export $(cat $CONFIG_FILE | grep -v '^#' | xargs)

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs data backups

# Run tests (if not in production)
if [ "$ENVIRONMENT" != "production" ]; then
    echo "🧪 Running tests..."
    npm test
fi

# Start the bot
echo "🚀 Starting trading bot..."
if [ "$ENVIRONMENT" = "production" ]; then
    # Use PM2 in production
    if command -v pm2 &> /dev/null; then
        echo "📊 Using PM2 process manager..."
        pm2 start ecosystem.config.js --env $ENVIRONMENT
        pm2 save
        echo "✅ Bot started with PM2"
        echo "📋 View logs: pm2 logs trading-bot"
        echo "📊 View status: pm2 status"
    else
        echo "⚠️ PM2 not found, starting directly..."
        npm start
    fi
else
    # Development mode
    echo "🔧 Starting in development mode..."
    npm run dev
fi

echo "✅ Deployment complete!"
echo "🌐 Dashboard: http://localhost:${DASHBOARD_PORT:-3000}"
echo "📝 Logs: logs/trading-bot.log"