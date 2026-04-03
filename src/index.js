#!/usr/bin/env node

/**
 * Binance Trading Bot - Main Entry Point
 * Automated trading system with news sentiment analysis
 */

require('dotenv').config();
const TradingBot = require('./core/TradingBot');
const Logger = require('./utils/logger');

// Initialize logger
const logger = new Logger('Main');

// Graceful shutdown handler
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Add any cleanup logic here
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});

// Main execution
(async () => {
  try {
    logger.info('Starting Binance Trading Bot...');
    
    // Validate environment variables
    const requiredEnvVars = ['BINANCE_API_KEY', 'BINANCE_API_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    // Initialize trading bot
    const bot = new TradingBot({
      apiKey: process.env.BINANCE_API_KEY,
      apiSecret: process.env.BINANCE_API_SECRET,
      tradingPair: process.env.TRADING_PAIR || 'BTCUSDT',
      riskPercentage: parseFloat(process.env.RISK_PERCENTAGE) || 2,
      testnet: process.env.BINANCE_TESTNET === 'true'
    });
    
    // Start the bot
    await bot.initialize();
    await bot.start();
    
    logger.info('Trading bot started successfully');
    
    // Keep the process alive
    setInterval(() => {
      // Heartbeat to keep process alive
    }, 60000);
    
  } catch (error) {
    logger.error('Failed to start trading bot:', error);
    process.exit(1);
  }
})();