/**
 * Dashboard UI
 * Complete web interface for monitoring and controlling the trading bot
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

class Dashboard {
  constructor(config) {
    this.config = {
      port: config.port || 3000,
      updateInterval: config.updateInterval || 1000,
      historyLimit: config.historyLimit || 1000,
      ...config
    };
    
    this.app = null;
    this.server = null;
    this.io = null;
    this.isRunning = false;
    
    // Data storage for dashboard
    this.data = {
      market: {
        prices: [],
        volumes: [],
        orderBook: { bids: [], asks: [] },
        ticker: null
      },
      trades: {
        open: [],
        closed: [],
        history: []
      },
      performance: {
        metrics: {},
        charts: {
          pnl: [],
          balance: [],
          winRate: []
        }
      },
      system: {
        health: {},
        logs: [],
        alerts: []
      },
      news: {
        items: [],
        sentiment: 'neutral',
        score: 0
      }
    };
    
    // WebSocket clients
    this.clients = new Set();
    
    // API endpoints configuration
    this.apiEndpoints = {
      market: '/api/market',
      trades: '/api/trades',
      performance: '/api/performance',
      system: '/api/system',
      news: '/api/news',
      control: '/api/control'
    };
    
    console.log('📊 Dashboard initialized');
  }

  /**
   * Initialize dashboard server
   */
  async initialize() {
    try {
      // Create Express app
      this.app = express();
      this.server = http.createServer(this.app);
      this.io = socketIo(this.server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Serve static files
      this.serveStaticFiles();
      
      console.log('✅ Dashboard initialized');
      return { success: true, message: 'Dashboard initialized' };
      
    } catch (error) {
      console.error('❌ Failed to initialize dashboard:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // JSON parsing
    this.app.use(express.json());
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📥 ${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Market data endpoint
    this.app.get(this.apiEndpoints.market, (req, res) => {
      res.json({
        success: true,
        data: this.data.market,
        timestamp: Date.now()
      });
    });
    
    // Trades endpoint
    this.app.get(this.apiEndpoints.trades, (req, res) => {
      const { type = 'all', limit = 50 } = req.query;
      
      let trades = [];
      if (type === 'open') {
        trades = this.data.trades.open;
      } else if (type === 'closed') {
        trades = this.data.trades.closed;
      } else {
        trades = this.data.trades.history;
      }
      
      res.json({
        success: true,
        data: trades.slice(-limit),
        count: trades.length,
        timestamp: Date.now()
      });
    });
    
    // Performance endpoint
    this.app.get(this.apiEndpoints.performance, (req, res) => {
      res.json({
        success: true,
        data: this.data.performance,
        timestamp: Date.now()
      });
    });
    
    // System health endpoint
    this.app.get(this.apiEndpoints.system, (req, res) => {
      res.json({
        success: true,
        data: this.data.system,
        timestamp: Date.now()
      });
    });
    
    // News endpoint
    this.app.get(this.apiEndpoints.news, (req, res) => {
      const { limit = 10 } = req.query;
      
      res.json({
        success: true,
        data: {
          items: this.data.news.items.slice(-limit),
          sentiment: this.data.news.sentiment,
          score: this.data.news.score
        },
        timestamp: Date.now()
      });
    });
    
    // Control endpoints
    this.app.post(`${this.apiEndpoints.control}/start`, (req, res) => {
      // Start trading bot
      this.emitControlEvent('start', req.body);
      res.json({ success: true, message: 'Start command sent' });
    });
    
    this.app.post(`${this.apiEndpoints.control}/stop`, (req, res) => {
      // Stop trading bot
      this.emitControlEvent('stop', req.body);
      res.json({ success: true, message: 'Stop command sent' });
    });
    
    this.app.post(`${this.apiEndpoints.control}/pause`, (req, res) => {
      // Pause trading
      this.emitControlEvent('pause', req.body);
      res.json({ success: true, message: 'Pause command sent' });
    });
    
    this.app.post(`${this.apiEndpoints.control}/resume`, (req, res) => {
      // Resume trading
      this.emitControlEvent('resume', req.body);
      res.json({ success: true, message: 'Resume command sent' });
    });
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        clients: this.clients.size
      });
    });
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Binance Trading Bot Dashboard',
        version: '1.0.0',
        endpoints: this.apiEndpoints,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Setup WebSocket server
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('🔌 New WebSocket client connected');
      this.clients.add(socket);
      
      // Send initial data
      socket.emit('init', {
        market: this.data.market,
        trades: this.data.trades,
        performance: this.data.performance,
        system: this.data.system,
        news: this.data.news
      });
      
      // Handle client messages
      socket.on('control', (data) => {
        this.handleControlMessage(socket, data);
      });
      
      socket.on('subscribe', (data) => {
        this.handleSubscription(socket, data);
      });
      
      socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected');
        this.clients.delete(socket);
      });
    });
  }

  /**
   * Serve static files for web interface
   */
  serveStaticFiles() {
    // In production, this would serve the built React/Vue app
    this.app.use(express.static(path.join(__dirname, '../../public')));
    
    // Fallback to simple HTML if no static files
    this.app.get('/dashboard', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Trading Bot Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #0f0f23; color: #00ff00; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 30px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .card { background: #1a1a2e; padding: 20px; border-radius: 10px; border: 1px solid #00ff00; }
            .card h3 { margin-top: 0; color: #00ff00; }
            .metric { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .positive { color: #00ff00; }
            .negative { color: #ff0000; }
            .neutral { color: #ffff00; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 Binance Trading Bot Dashboard</h1>
              <p>Real-time monitoring and control interface</p>
            </div>
            <div class="grid">
              <div class="card">
                <h3>Market Data</h3>
                <div id="market-data">Loading...</div>
              </div>
              <div class="card">
                <h3>Performance</h3>
                <div id="performance">Loading...</div>
              </div>
              <div class="card">
                <h3>Open Trades</h3>
                <div id="open-trades">Loading...</div>
              </div>
              <div class="card">
                <h3>System Health</h3>
                <div id="system-health">Loading...</div>
              </div>
              <div class="card">
                <h3>News Sentiment</h3>
                <div id="news-sentiment">Loading...</div>
              </div>
              <div class="card">
                <h3>Controls</h3>
                <div id="controls">
                  <button onclick="sendControl('start')">Start Bot</button>
                  <button onclick="sendControl('stop')">Stop Bot</button>
                  <button onclick="sendControl('pause')">Pause Trading</button>
                  <button onclick="sendControl('resume')">Resume Trading</button>
                </div>
              </div>
            </div>
          </div>
          <script src="/socket.io/socket.io.js"></script>
          <script>
            const socket = io();
            
            socket.on('init', (data) => {
              updateDashboard(data);
            });
            
            socket.on('market', (data) => {
              updateMarket(data);
            });
            
            socket.on('trade', (data) => {
              updateTrades(data);
            });
            
            socket.on('performance', (data) => {
              updatePerformance(data);
            });
            
            socket.on('system', (data) => {
              updateSystem(data);
            });
            
            socket.on('news', (data) => {
              updateNews(data);
            });
            
            function updateDashboard(data) {
              updateMarket(data.market);
              updateTrades(data.trades);
              updatePerformance(data.performance);
              updateSystem(data.system);
              updateNews(data.news);
            }
            
            function updateMarket(data) {
              document.getElementById('market-data').innerHTML = \`
                <div class="metric">\${data.ticker?.price || 'N/A'} USD</div>
                <div>Bids: \${data.orderBook.bids.length}</div>
                <div>Asks: \${data.orderBook.asks.length}</div>
              \`;
            }
            
            function updateTrades(data) {
              document.getElementById('open-trades').innerHTML = \`
                <div class="metric">\${data.open.length} Open</div>
                <div>\${data.closed.length} Closed</div>
              \`;
            }
            
            function updatePerformance(data) {
              const pnl = data.metrics.totalProfit || 0;
              const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
              
              document.getElementById('performance').innerHTML = \`
                <div class="metric \${pnlClass}">\${pnl.toFixed(2)}%</div>
                <div>Win Rate: \${(data.metrics.winRate || 0).toFixed(1)}%</div>
                <div>Trades: \${data.metrics.totalTrades || 0}</div>
              \`;
            }
            
            function updateSystem(data) {
              const health = data.health.healthy ? '✅ Healthy' : '❌ Unhealthy';
              document.getElementById('system-health').innerHTML = \`
                <div class="metric">\${health}</div>
                <div>Logs: \${data.logs.length}</div>
                <div>Alerts: \${data.alerts.length}</div>
              \`;
            }
            
            function updateNews(data) {
              const sentimentClass = data.sentiment === 'positive' ? 'positive' : 
                                   data.sentiment === 'negative' ? 'negative' : 'neutral';
              
              document.getElementById('news-sentiment').innerHTML = \`
                <div class="metric \${sentimentClass}">\${data.sentiment}</div>
                <div>Score: \${data.score.toFixed(3)}</div>
                <div>Items: \${data.items.length}</div>
              \`;
            }
            
            function sendControl(action) {
              socket.emit('control', { action });
            }
          </script>
        </body>
        </html>
      `);
    });
  }

  /**
   * Handle control messages from clients
   */
  handleControlMessage(socket, data) {
    console.log(`🎮 Control message from client:`, data);
    
    // Broadcast control event to all clients
    this.emitControlEvent(data.action, data);
    
    // Send acknowledgment
    socket.emit('control_ack', {
      success: true,
      action: data.action,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client subscriptions
   */
  handleSubscription(socket, data) {
    const { channels } = data;
    
    console.log(`📡 Client subscribed to channels:`, channels);
    
    // Join socket rooms for each channel
    channels.forEach(channel => {
      socket.join(channel);
    });
    
    socket.emit('subscription_ack', {
      success: true,
      channels,
      timestamp: Date.now()
    });
  }

  /**
   * Emit control event to all clients
   */
  emitControlEvent(action, data) {
    this.io.emit('control_event', {
      action,
      data,
      timestamp: Date.now()
    });
    
    // Log the control event
    this.addLog(`Control event: ${action}`, 'info');
  }

  /**
   * Start dashboard server
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Dashboard is already running');
      return { success: false, message: 'Already running' };
    }
    
    try {
      return new Promise((resolve, reject) => {
        this.server.listen(this.config.port, () => {
          this.isRunning = true;
          console.log(`✅ Dashboard running on http://localhost:${this.config.port}`);
          
          // Start data update interval
          this.startUpdateInterval();
          
          resolve({ 
            success: true, 
            message: `Dashboard started on port ${this.config.port}`,
            url: `http://localhost:${this.config.port}`
          });
        });
        
        this.server.on('error', (error) => {
          reject(error);
        });
      });
      
    } catch (error) {
      console.error('❌ Failed to start dashboard:', error);
      throw error;
    }
  }

  /**
   * Stop dashboard server
   */
  async stop() {
    if (!this.isRunning) {
      return { success: false, message: 'Not running' };
    }
    
    try {
      // Stop update interval
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
      
      // Close WebSocket connections
      this.io.close();
      
      // Close HTTP server
      await new Promise((resolve, reject) => {
        this.server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      
      this.isRunning = false;
      console.log('✅ Dashboard stopped');
      return { success: true, message: 'Dashboard stopped' };
      
    } catch (error) {
      console.error('❌ Failed to stop dashboard:', error);
      throw error;
    }
  }

  /**
   * Start periodic data updates
   */
  startUpdateInterval() {
    this.updateInterval = setInterval(() => {
      this.broadcastUpdates();
    }, this.config.updateInterval);
    
    console.log(`🔄 Dashboard update interval started: ${this.config.updateInterval}ms`);
  }

  /**
   * Broadcast updates to all connected clients
   */
  broadcastUpdates() {
    if (this.clients.size === 0) return;
    
    // Emit market data updates
    this.io.emit('market', this.data.market);
    
    // Emit trade updates
    this.io.emit('trade', {
      open: this.data.trades.open,
      closed: this.data.trades.closed.slice(-10),
      history: this.data.trades.history.length
    });
    
    // Emit performance updates
    this.io.emit('performance', this.data.performance);
    
    // Emit system updates
    this.io.emit('system', this.data.system);
    
    // Emit news updates
    this.io.emit('news', {
      items: this.data.news.items.slice(-5),
      sentiment: this.data.news.sentiment,
      score: this.data.news.score
    });
  }

  /**
   * Update market data on dashboard
   */
  updateMarketData(data) {
    // Update price history
    this.data.market.prices.push({
      timestamp: Date.now(),
      price: data.price,
      volume: data.volume
    });
    
    // Keep history within limit
    if (this.data.market.prices.length > this.config.historyLimit) {
      this.data.market.prices.shift();
    }
    
    // Update ticker
    this.data.market.ticker = {
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      high: data.high,
      low: data.low,
      volume: data.volume,
      timestamp: Date.now()
    };
    
    // Update order book if provided
    if (data.orderBook) {
      this.data.market.orderBook = data.orderBook;
    }
    
    // Broadcast to specific channel
    this.io.to('market').emit('market_update', this.data.market);
  }

  /**
   * Add trade to dashboard
   */
  addTrade(trade) {
    const tradeRecord = {
      id: trade.id,
      symbol: trade.symbol || trade.pair,
      side: trade.side,
      price: trade.price,
      quantity: trade.quantity,
      timestamp: trade.timestamp || Date.now(),
      strategy: trade.strategy,
      status: 'open'
    };
    
    // Add to open trades
    this.data.trades.open.push(tradeRecord);
    
    // Add to history
    this.data.trades.history.push(tradeRecord);
    
    // Keep history within limit
    if (this.data.trades.history.length > this.config.historyLimit) {
      this.data.trades.history.shift();
    }
    
    // Broadcast to specific channel
    this.io.to('trades').emit('trade_new', tradeRecord);
    
    // Add log entry
    this.addLog(`New trade: ${trade.side} ${trade.quantity} ${trade.symbol} at ${trade.price}`, 'info');
  }

  /**
   * Update trade status
   */
  updateTrade(tradeId, update) {
    const tradeIndex = this.data.trades.open.findIndex(t => t.id === tradeId);
    
    if (tradeIndex !== -1) {
      const trade = this.data.trades.open[tradeIndex];
      
      // Update trade
      Object.assign(trade, update);
      trade.updatedAt = Date.now();
      
      // If trade is closed, move to closed trades
      if (update.status === 'closed') {
        this.data.trades.open.splice(tradeIndex, 1);
        this.data.trades.closed.push(trade);
        
        // Keep closed trades within limit
        if (this.data.trades.closed.length > 100) {
          this.data.trades.closed.shift();
        }
        
        // Broadcast closure
        this.io.to('trades').emit('trade_closed', trade);
        
        // Add log entry
        this.addLog(`Trade closed: ${trade.side} ${trade.symbol} PnL: ${update.pnl || 0}%`, 'info');
      } else {
        // Broadcast update
        this.io.to('trades').emit('trade_update', trade);
      }
    }
  }

  /**
   * Update performance metrics
   */
  updatePerformance(metrics) {
    // Update metrics
    this.data.performance.metrics = metrics;
    
    // Update chart data
    this.data.performance.charts.pnl.push({
      timestamp: Date.now(),
      value: metrics.totalProfit || 0
    });
    
    this.data.performance.charts.balance.push({
      timestamp: Date.now(),
      value: metrics.currentBalance || 0
    });
    
    this.data.performance.charts.winRate.push({
      timestamp: Date.now(),
      value: metrics.winRate || 0
    });
    
    // Keep chart data within limits
    ['pnl', 'balance', 'winRate'].forEach(chart => {
      if (this.data.performance.charts[chart].length > 100) {
        this.data.performance.charts[chart].shift();
      }
    });
    
    // Broadcast to specific channel
    this.io.to('performance').emit('performance_update', this.data.performance);
  }

  /**
   * Update system health
   */
  updateSystemHealth(health) {
    this.data.system.health = health;
    
    // Add health check log
    this.addLog(`System health: ${health.healthy ? 'Healthy' : 'Unhealthy'}`, 
                health.healthy ? 'info' : 'warning');
    
    // Broadcast to specific channel
    this.io.to('system').emit('system_update', this.data.system);
  }

  /**
   * Update news data
   */
  updateNews(news) {
    this.data.news.items = news.items || [];
    this.data.news.sentiment = news.sentiment || 'neutral';
    this.data.news.score = news.score || 0;
    
    // Broadcast to specific channel
    this.io.to('news').emit('news_update', this.data.news);
  }

  /**
   * Add log entry
   */
  addLog(message, level = 'info') {
    const logEntry = {
      timestamp: Date.now(),
      message,
      level
    };
    
    this.data.system.logs.push(logEntry);
    
    // Keep logs within limit
    if (this.data.system.logs.length > 1000) {
      this.data.system.logs.shift();
    }
    
    // Broadcast log to admin channel
    this.io.to('admin').emit('log', logEntry);
    
    // Console output based on level
    const consoleMethod = level === 'error' ? 'error' : 
                         level === 'warning' ? 'warn' : 'log';
    console[consoleMethod](`[Dashboard] ${message}`);
  }

  /**
   * Add alert
   */
  addAlert(message, type = 'info', data = null) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      message,
      type,
      data,
      acknowledged: false
    };
    
    this.data.system.alerts.push(alert);
    
    // Keep alerts within limit
    if (this.data.system.alerts.length > 100) {
      this.data.system.alerts.shift();
    }
    
    // Broadcast alert to all clients
    this.io.emit('alert', alert);
    
    console.log(`🚨 Alert: ${message}`);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId) {
    const alertIndex = this.data.system.alerts.findIndex(a => a.id === alertId);
    
    if (alertIndex !== -1) {
      this.data.system.alerts[alertIndex].acknowledged = true;
      this.data.system.alerts[alertIndex].acknowledgedAt = Date.now();
      
      // Broadcast acknowledgment
      this.io.emit('alert_acknowledged', { alertId });
    }
  }

  /**
   * Get dashboard statistics
   */
  getStats() {
    return {
      clients: this.clients.size,
      isRunning: this.isRunning,
      data: {
        market: {
          pricePoints: this.data.market.prices.length,
          lastUpdate: this.data.market.prices.length > 0 
            ? this.data.market.prices[this.data.market.prices.length - 1].timestamp 
            : null
        },
        trades: {
          open: this.data.trades.open.length,
          closed: this.data.trades.closed.length,
          history: this.data.trades.history.length
        },
        system: {
          logs: this.data.system.logs.length,
          alerts: this.data.system.alerts.filter(a => !a.acknowledged).length
        },
        news: {
          items: this.data.news.items.length,
          sentiment: this.data.news.sentiment
        }
      },
      config: this.config
    };
  }

  /**
   * Check dashboard health
   */
  async checkHealth() {
    const health = {
      timestamp: Date.now(),
      isRunning: this.isRunning,
      port: this.config.port,
      clients: this.clients.size,
      stats: this.getStats(),
      lastBroadcast: Date.now() // Simplified, would track actual last broadcast
    };
    
    // Check server status
    if (this.server && this.server.listening) {
      health.server = 'listening';
    } else {
      health.server = 'not_listening';
    }
    
    // Check WebSocket status
    if (this.io && this.io.engine) {
      health.websocket = 'connected';
    } else {
      health.websocket = 'disconnected';
    }
    
    health.healthy = health.isRunning && 
                     health.server === 'listening' && 
                     health.websocket === 'connected';
    
    return health;
  }

  /**
   * Export dashboard data
   */
  async exportData(format = 'json') {
    const data = {
      metadata: {
        exportedAt: Date.now(),
        stats: this.getStats()
      },
      market: this.data.market,
      trades: {
        open: this.data.trades.open,
        closed: this.data.trades.closed,
        history: this.data.trades.history.slice(-100)
      },
      performance: this.data.performance,
      system: {
        health: this.data.system.health,
        logs: this.data.system.logs.slice(-100),
        alerts: this.data.system.alerts
      },
      news: this.data.news
    };
    
    if (format === 'csv') {
      // Simplified CSV export - in production would create proper CSV files
      return JSON.stringify(data);
    }
    
    return data;
  }

  /**
   * Clear dashboard data
   */
  async clearData() {
    const stats = this.getStats();
    
    // Clear all data
    this.data = {
      market: {
        prices: [],
        volumes: [],
        orderBook: { bids: [], asks: [] },
        ticker: null
      },
      trades: {
        open: [],
        closed: [],
        history: []
      },
      performance: {
        metrics: {},
        charts: {
          pnl: [],
          balance: [],
          winRate: []
        }
      },
      system: {
        health: {},
        logs: [],
        alerts: []
      },
      news: {
        items: [],
        sentiment: 'neutral',
        score: 0
      }
    };
    
    console.log(`🗑️ Cleared dashboard data: ${JSON.stringify(stats)}`);
    
    // Notify clients
    this.io.emit('data_cleared', { timestamp: Date.now() });
    
    return { success: true, cleared: stats };
  }
}

module.exports = Dashboard;