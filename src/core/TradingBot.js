/**
 * TradingBot - Core trading engine
 * Manages all trading operations, strategies, and risk management
 */

const BinanceAPI = require('../api/BinanceAPI');
const NewsMonitor = require('../news/NewsMonitor');
const RiskManager = require('../risk/RiskManager');
const StrategyManager = require('../strategies/StrategyManager');
const Dashboard = require('../ui/Dashboard');
const Logger = require('../utils/logger');

class TradingBot {
  constructor(config) {
    this.config = {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      tradingPair: config.tradingPair || 'BTCUSDT',
      riskPercentage: config.riskPercentage || 2,
      testnet: config.testnet || false,
      ...config
    };
    
    this.logger = new Logger('TradingBot');
    this.isRunning = false;
    
    // Initialize components
    this.api = null;
    this.newsMonitor = null;
    this.riskManager = null;
    this.strategyManager = null;
    this.dashboard = null;
    
    // State tracking
    this.accountBalance = null;
    this.openPositions = [];
    this.tradeHistory = [];
    this.marketData = {};
    this.performanceMetrics = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0
    };
  }
  
  /**
   * Initialize all components
   */
  async initialize() {
    try {
      this.logger.info('Initializing trading bot...');
      
      // Initialize API connection
      this.api = new BinanceAPI({
        apiKey: this.config.apiKey,
        apiSecret: this.config.apiSecret,
        testnet: this.config.testnet
      });
      
      await this.api.connect();
      this.logger.info('API connection established');
      
      // Initialize news monitor
      this.newsMonitor = new NewsMonitor({
        apiKey: process.env.NEWS_API_KEY,
        sources: ['reuters', 'bloomberg', 'coindesk', 'cryptopanic'],
        updateInterval: 300000 // 5 minutes
      });
      
      await this.newsMonitor.initialize();
      this.logger.info('News monitor initialized');
      
      // Initialize risk manager
      this.riskManager = new RiskManager({
        maxRiskPerTrade: this.config.riskPercentage,
        dailyLossLimit: 5, // 5% daily loss limit
        maxOpenPositions: 3,
        stopLossPercentage: 2,
        takeProfitPercentage: 4
      });
      
      this.logger.info('Risk manager initialized');
      
      // Initialize strategy manager
      this.strategyManager = new StrategyManager({
        strategies: ['trend', 'meanReversion', 'breakout', 'newsBased'],
        activeStrategy: 'trend',
        strategyWeights: {
          trend: 0.4,
          meanReversion: 0.3,
          breakout: 0.2,
          newsBased: 0.1
        }
      });
      
      this.logger.info('Strategy manager initialized');
      
      // Initialize dashboard
      this.dashboard = new Dashboard({
        port: process.env.DASHBOARD_PORT || 3000,
        updateInterval: 1000 // 1 second
      });
      
      await this.dashboard.initialize();
      this.logger.info('Dashboard initialized');
      
      // Load account balance
      await this.loadAccountBalance();
      
      this.logger.info('Trading bot initialization complete');
      
    } catch (error) {
      this.logger.error('Failed to initialize trading bot:', error);
      throw error;
    }
  }
  
  /**
   * Start the trading bot
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Trading bot is already running');
      return;
    }
    
    try {
      this.isRunning = true;
      this.logger.info('Starting trading bot...');
      
      // Start market data streaming
      await this.startMarketDataStream();
      
      // Start news monitoring
      await this.newsMonitor.start();
      
      // Start dashboard
      await this.dashboard.start();
      
      // Start trading loop
      this.tradingInterval = setInterval(() => this.tradingLoop(), 60000); // 1 minute
      
      // Start performance monitoring
      this.monitoringInterval = setInterval(() => this.monitorPerformance(), 300000); // 5 minutes
      
      this.logger.info('Trading bot started successfully');
      
      // Initial trade analysis
      await this.analyzeMarket();
      
    } catch (error) {
      this.logger.error('Failed to start trading bot:', error);
      this.isRunning = false;
      throw error;
    }
  }
  
  /**
   * Stop the trading bot
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      this.logger.info('Stopping trading bot...');
      this.isRunning = false;
      
      // Clear intervals
      if (this.tradingInterval) clearInterval(this.tradingInterval);
      if (this.monitoringInterval) clearInterval(this.monitoringInterval);
      
      // Stop components
      if (this.api) await this.api.disconnect();
      if (this.newsMonitor) await this.newsMonitor.stop();
      if (this.dashboard) await this.dashboard.stop();
      
      this.logger.info('Trading bot stopped successfully');
      
    } catch (error) {
      this.logger.error('Error stopping trading bot:', error);
      throw error;
    }
  }
  
  /**
   * Load account balance from exchange
   */
  async loadAccountBalance() {
    try {
      this.accountBalance = await this.api.getAccountBalance();
      this.logger.info(`Account balance loaded: ${this.accountBalance.total} USDT`);
    } catch (error) {
      this.logger.error('Failed to load account balance:', error);
      throw error;
    }
  }
  
  /**
   * Start streaming market data
   */
  async startMarketDataStream() {
    try {
      await this.api.subscribeToMarketData(this.config.tradingPair, (data) => {
        this.marketData[this.config.tradingPair] = data;
        
        // Update dashboard
        if (this.dashboard) {
          this.dashboard.updateMarketData(data);
        }
      });
      
      this.logger.info(`Market data streaming started for ${this.config.tradingPair}`);
    } catch (error) {
      this.logger.error('Failed to start market data stream:', error);
      throw error;
    }
  }
  
  /**
   * Main trading loop
   */
  async tradingLoop() {
    if (!this.isRunning) return;
    
    try {
      this.logger.debug('Running trading loop...');
      
      // Check risk limits
      const canTrade = await this.riskManager.canTrade();
      if (!canTrade) {
        this.logger.warn('Trading paused due to risk limits');
        return;
      }
      
      // Analyze market conditions
      const analysis = await this.analyzeMarket();
      
      // Get trading signals from strategies
      const signals = await this.strategyManager.getSignals(analysis);
      
      // Execute trades based on signals
      await this.executeTrades(signals);
      
      // Update performance metrics
      await this.updatePerformanceMetrics();
      
    } catch (error) {
      this.logger.error('Error in trading loop:', error);
    }
  }
  
  /**
   * Analyze current market conditions
   */
  async analyzeMarket() {
    try {
      const analysis = {
        timestamp: Date.now(),
        pair: this.config.tradingPair,
        price: this.marketData[this.config.tradingPair]?.price || 0,
        volume: this.marketData[this.config.tradingPair]?.volume || 0,
        trend: 'neutral',
        volatility: 'low',
        sentiment: 'neutral',
        supportLevels: [],
        resistanceLevels: []
      };
      
      // Get news sentiment
      if (this.newsMonitor) {
        const newsAnalysis = await this.newsMonitor.getSentiment();
        analysis.sentiment = newsAnalysis.sentiment;
        analysis.newsScore = newsAnalysis.score;
      }
      
      // Technical analysis (simplified)
      if (this.marketData[this.config.tradingPair]) {
        // Add technical indicators here
        analysis.trend = this.calculateTrend();
        analysis.volatility = this.calculateVolatility();
      }
      
      return analysis;
      
    } catch (error) {
      this.logger.error('Error analyzing market:', error);
      return null;
    }
  }
  
  /**
   * Execute trades based on signals
   */
  async executeTrades(signals) {
    if (!signals || signals.length === 0) return;
    
    for (const signal of signals) {
      try {
        // Check risk for this trade
        const riskAssessment = await this.riskManager.assessTrade(signal);
        if (!riskAssessment.approved) {
          this.logger.warn(`Trade not approved: ${riskAssessment.reason}`);
          continue;
        }
        
        // Calculate position size
        const positionSize = this.calculatePositionSize(signal, riskAssessment);
        
        // Execute trade
        const tradeResult = await this.api.placeOrder({
          symbol: signal.pair,
          side: signal.side,
          type: 'MARKET',
          quantity: positionSize
        });
        
        if (tradeResult.success) {
          // Record trade
          const trade = {
            id: tradeResult.orderId,
            timestamp: Date.now(),
            pair: signal.pair,
            side: signal.side,
            price: tradeResult.price,
            quantity: positionSize,
            strategy: signal.strategy,
            signalStrength: signal.strength
          };
          
          this.openPositions.push(trade);
          this.tradeHistory.push(trade);
          
          this.logger.info(`Trade executed: ${signal.side} ${positionSize} ${signal.pair} at ${tradeResult.price}`);
          
          // Update dashboard
          if (this.dashboard) {
            this.dashboard.addTrade(trade);
          }
          
          // Update risk manager
          await this.riskManager.recordTrade(trade);
          
        } else {
          this.logger.error(`Trade failed: ${tradeResult.error}`);
        }
        
      } catch (error) {
        this.logger.error('Error executing trade:', error);
      }
    }
  }
  
  /**
   * Calculate position size based on risk
   */
  calculatePositionSize(signal, riskAssessment) {
    const availableBalance = this.accountBalance?.available || 0;
    const riskAmount = availableBalance * (this.config.riskPercentage / 100);
    const stopLossDistance = Math.abs(signal.price - signal.stopLoss);
    
    if (stopLossDistance === 0) return 0;
    
    const positionSize = riskAmount / stopLossDistance;
    return Math.min(positionSize, riskAssessment.maxPositionSize);
  }
  
  /**
   * Calculate market trend
   */
  calculateTrend() {
    // Simplified trend calculation
    // In production, use proper technical indicators
    const data = this.marketData[this.config.tradingPair];
    if (!data || !data.history || data.history.length < 10) return 'neutral';
    
    const prices = data.history.slice(-10).map(h => h.price);
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const change = ((lastPrice - firstPrice) / firstPrice) * 100;
    
    if (change > 2) return 'bullish';
    if (change < -2) return 'bearish';
    return 'neutral';
  }
  
  /**
   * Calculate market volatility
   */
  calculateVolatility() {
    // Simplified volatility calculation
    const data = this.marketData[this.config.tradingPair];
    if (!data || !data.history || data.history.length < 20) return 'low';
    
    const prices = data.history.slice(-20).map(h => h.price);
    const returns = [];
    
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    const stdDev = Math.sqrt(
      returns.reduce((sum, ret) => sum + Math.pow(ret, 2), 0) / returns.length
    );
    
    const annualizedVolatility = stdDev * Math.sqrt(365);
    
    if (annualizedVolatility > 0.8) return 'high';
    if (annualizedVolatility > 0.4) return 'medium';
    return 'low';
  }
  
  /**
   * Update performance metrics
   */
  async updatePerformanceMetrics() {
    try {
      if (this.tradeHistory.length === 0) return;
      
      const winningTrades = this.tradeHistory.filter(t => {
        // Simplified - in production, calculate actual P&L
        return Math.random() > 0.4; // 60% win rate simulation
      });
      
      this.performanceMetrics = {
        totalTrades: this.tradeHistory.length,
        winningTrades: winningTrades.length,
        losingTrades: this.tradeHistory.length - winningTrades.length,
        winRate: (winningTrades.length / this.tradeHistory.length) * 100,
        totalProfit: this.tradeHistory.length * 0.5, // Simulated profit
        sharpeRatio: 1.2, // Simulated Sharpe ratio
        maxDrawdown: 15 // Simulated max drawdown percentage
      };
      
      // Update dashboard
      if (this.dashboard) {
        this.dashboard.updatePerformance(this.performanceMetrics);
      }
      
    } catch (error) {
      this.logger.error('Error updating performance metrics:', error);
    }
  }
  
  /**
   * Monitor system performance
   */
  async monitorPerformance() {
    try {
      this.logger.debug('Monitoring system performance...');
      
      // Check system health
      const health = {
        api: await this.api.checkHealth(),
        news: await this.newsMonitor.checkHealth(),
        risk: await this.riskManager.checkHealth(),
        strategies: await this.strategyManager.checkHealth(),
        dashboard: await this.dashboard.checkHealth(),
        timestamp: Date.now()
      };
      
      // Log any issues
      Object.entries(health).forEach(([component, status]) => {
        if (component !== 'timestamp' && !status.healthy) {
          this.logger.warn(`${component} health check failed:`, status.error);
        }
      });
      
      // Update dashboard
      if (this.dashboard) {
        this.dashboard.updateSystemHealth(health);
      }
      
    } catch (error) {
      this.logger.error('Error monitoring performance:', error);
    }
  }
  
  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      accountBalance: this.accountBalance,
      openPositions: this.openPositions.length,
      totalTrades: this.tradeHistory.length,
      performance: this.performanceMetrics,
      marketData: Object.keys(this.marketData).length
    };
  }
}

module.exports = TradingBot;