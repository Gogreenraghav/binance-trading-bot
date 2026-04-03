/**
 * Binance API Integration
 * Complete WebSocket and REST API implementation for Binance
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');

class BinanceAPI {
  constructor(config) {
    this.config = {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      testnet: config.testnet || false,
      ...config
    };
    
    this.baseURL = this.config.testnet 
      ? 'https://testnet.binance.vision' 
      : 'https://api.binance.com';
    
    this.wsURL = this.config.testnet
      ? 'wss://testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';
    
    this.ws = null;
    this.isConnected = false;
    this.wsSubscriptions = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    // Market data cache
    this.marketData = {
      orderBooks: new Map(),
      tickers: new Map(),
      klines: new Map(),
      trades: new Map()
    };
    
    // HTTP client with rate limiting
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'X-MBX-APIKEY': this.config.apiKey
      }
    });
    
    // Rate limiting
    this.rateLimits = {
      requests: [],
      orders: [],
      weight: 0,
      maxWeight: 1200 // Binance weight limit per minute
    };
  }

  /**
   * Connect to Binance API
   */
  async connect() {
    try {
      await this.testConnection();
      await this.startWebSocket();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      console.log(`✅ Connected to Binance ${this.config.testnet ? 'Testnet' : 'Mainnet'}`);
      return { success: true, message: 'Connected successfully' };
      
    } catch (error) {
      console.error('❌ Failed to connect to Binance:', error.message);
      throw error;
    }
  }

  /**
   * Test REST API connection
   */
  async testConnection() {
    try {
      const response = await this.httpClient.get('/api/v3/ping');
      return response.status === 200;
    } catch (error) {
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Start WebSocket connection
   */
  async startWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsURL);
      
      this.ws.on('open', () => {
        console.log('🔌 WebSocket connected');
        this.setupWebSocketHandlers();
        resolve();
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        this.isConnected = false;
        this.handleReconnection();
      });
    });
  }

  /**
   * Setup WebSocket message handlers
   */
  setupWebSocketHandlers() {
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleWebSocketMessage(message) {
    if (message.e) {
      // Event-based messages
      switch (message.e) {
        case 'depthUpdate':
          this.handleOrderBookUpdate(message);
          break;
        case '24hrTicker':
          this.handleTickerUpdate(message);
          break;
        case 'kline':
          this.handleKlineUpdate(message);
          break;
        case 'trade':
          this.handleTradeUpdate(message);
          break;
        case 'outboundAccountPosition':
          this.handleAccountUpdate(message);
          break;
        case 'executionReport':
          this.handleOrderUpdate(message);
          break;
      }
    }
    
    // Call subscription callbacks
    if (message.id && this.wsSubscriptions.has(message.id)) {
      const callback = this.wsSubscriptions.get(message.id);
      callback(message);
    }
  }

  /**
   * Handle order book updates
   */
  handleOrderBookUpdate(data) {
    const symbol = data.s.toLowerCase();
    if (!this.marketData.orderBooks.has(symbol)) {
      this.marketData.orderBooks.set(symbol, {
        bids: [],
        asks: [],
        lastUpdateId: data.u
      });
    }
    
    const orderBook = this.marketData.orderBooks.get(symbol);
    orderBook.bids = this.updatePriceLevels(orderBook.bids, data.b, 'desc');
    orderBook.asks = this.updatePriceLevels(orderBook.asks, data.a, 'asc');
    orderBook.lastUpdateId = data.u;
  }

  /**
   * Update price levels in order book
   */
  updatePriceLevels(currentLevels, updates, sortOrder) {
    const levels = new Map();
    
    // Add current levels
    currentLevels.forEach(level => {
      if (parseFloat(level[1]) > 0) {
        levels.set(level[0], parseFloat(level[1]));
      }
    });
    
    // Apply updates
    updates.forEach(update => {
      const quantity = parseFloat(update[1]);
      if (quantity === 0) {
        levels.delete(update[0]);
      } else {
        levels.set(update[0], quantity);
      }
    });
    
    // Convert back to array and sort
    let result = Array.from(levels.entries()).map(([price, quantity]) => [price, quantity.toString()]);
    
    if (sortOrder === 'desc') {
      result.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    } else {
      result.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    }
    
    return result.slice(0, 20); // Keep top 20 levels
  }

  /**
   * Handle ticker updates
   */
  handleTickerUpdate(data) {
    const symbol = data.s.toLowerCase();
    this.marketData.tickers.set(symbol, {
      symbol: data.s,
      price: parseFloat(data.c),
      priceChange: parseFloat(data.p),
      priceChangePercent: parseFloat(data.P),
      volume: parseFloat(data.v),
      quoteVolume: parseFloat(data.q),
      high: parseFloat(data.h),
      low: parseFloat(data.l),
      open: parseFloat(data.o),
      close: parseFloat(data.c),
      timestamp: data.E
    });
  }

  /**
   * Handle kline/candlestick updates
   */
  handleKlineUpdate(data) {
    const symbol = data.s.toLowerCase();
    const interval = data.k.i;
    const key = `${symbol}_${interval}`;
    
    if (!this.marketData.klines.has(key)) {
      this.marketData.klines.set(key, []);
    }
    
    const klines = this.marketData.klines.get(key);
    const kline = {
      openTime: data.k.t,
      open: parseFloat(data.k.o),
      high: parseFloat(data.k.h),
      low: parseFloat(data.k.l),
      close: parseFloat(data.k.c),
      volume: parseFloat(data.k.v),
      closeTime: data.k.T,
      quoteVolume: parseFloat(data.k.q),
      trades: data.k.n,
      takerBuyBaseVolume: parseFloat(data.k.V),
      takerBuyQuoteVolume: parseFloat(data.k.Q)
    };
    
    // Update or add kline
    const existingIndex = klines.findIndex(k => k.openTime === kline.openTime);
    if (existingIndex >= 0) {
      klines[existingIndex] = kline;
    } else {
      klines.push(kline);
      // Keep only last 1000 klines
      if (klines.length > 1000) {
        klines.shift();
      }
    }
  }

  /**
   * Handle trade updates
   */
  handleTradeUpdate(data) {
    const symbol = data.s.toLowerCase();
    
    if (!this.marketData.trades.has(symbol)) {
      this.marketData.trades.set(symbol, []);
    }
    
    const trades = this.marketData.trades.get(symbol);
    const trade = {
      id: data.t,
      price: parseFloat(data.p),
      quantity: parseFloat(data.q),
      time: data.T,
      isBuyerMaker: data.m,
      isBestMatch: data.M
    };
    
    trades.push(trade);
    // Keep only last 100 trades
    if (trades.length > 100) {
      trades.shift();
    }
  }

  /**
   * Handle account updates
   */
  handleAccountUpdate(data) {
    // Update local account balance cache
    console.log('Account update received:', data);
  }

  /**
   * Handle order updates
   */
  handleOrderUpdate(data) {
    // Update local order status
    console.log('Order update received:', data);
  }

  /**
   * Handle WebSocket reconnection
   */
  handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.startWebSocket();
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('✅ Reconnected successfully');
      } catch (error) {
        console.error('Reconnection failed:', error);
        this.handleReconnection();
      }
    }, delay);
  }

  /**
   * Subscribe to market data streams
   */
  async subscribeToMarketData(symbol, callback) {
    const streams = [
      `${symbol.toLowerCase()}@depth20@100ms`,
      `${symbol.toLowerCase()}@ticker`,
      `${symbol.toLowerCase()}@kline_1m`,
      `${symbol.toLowerCase()}@trade`
    ];
    
    const subscriptionId = Date.now();
    this.wsSubscriptions.set(subscriptionId, callback);
    
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: streams,
      id: subscriptionId
    };
    
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log(`Subscribed to ${symbol} market data`);
    } else {
      throw new Error('WebSocket not connected');
    }
    
    return { success: true, subscriptionId };
  }

  /**
   * Get account balance
   */
  async getAccountBalance() {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString);
      
      const response = await this.httpClient.get('/api/v3/account', {
        params: {
          timestamp,
          signature
        }
      });
      
      const balances = response.data.balances.reduce((acc, balance) => {
        const free = parseFloat(balance.free);
        const locked = parseFloat(balance.locked);
        const total = free + locked;
        
        if (total > 0) {
          acc[balance.asset] = { free, locked, total };
        }
        
        return acc;
      }, {});
      
      const totalUSDT = Object.values(balances).reduce((sum, balance) => {
        // In production, convert all balances to USDT using current prices
        return sum + balance.total;
      }, 0);
      
      return {
        balances,
        total: totalUSDT,
        available: balances.USDT?.free || 0,
        inOrders: balances.USDT?.locked || 0,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('Failed to get account balance:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Place an order
   */
  async placeOrder(order) {
    try {
      const {
        symbol,
        side,
        type = 'MARKET',
        quantity,
        price,
        stopPrice,
        timeInForce = 'GTC'
      } = order;
      
      const params = {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase(),
        type: type.toUpperCase(),
        quantity: parseFloat(quantity).toFixed(8),
        timestamp: Date.now()
      };
      
      if (price) params.price = parseFloat(price).toFixed(8);
      if (stopPrice) params.stopPrice = parseFloat(stopPrice).toFixed(8);
      if (type !== 'MARKET') params.timeInForce = timeInForce;
      
      const queryString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
      
      params.signature = this.generateSignature(queryString);
      
      const response = await this.httpClient.post('/api/v3/order', null, { params });
      
      return {
        success: true,
        orderId: response.data.orderId,
        clientOrderId: response.data.clientOrderId,
        symbol: response.data.symbol,
        side: response.data.side,
        type: response.data.type,
        quantity: parseFloat(response.data.origQty),
        price: parseFloat(response.data.price || response.data.avgPrice || 0),
        status: response.data.status,
        timestamp: response.data.transactTime
      };
      
    } catch (error) {
      console.error('Failed to place order:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.msg || error.message,
        code: error.response?.data?.code
      };
    }
  }

  /**
   * Generate HMAC SHA256 signature
   */
  generateSignature(queryString) {
    return crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Get order book
   */
  async getOrderBook(symbol, limit = 100) {
    try {
      const response = await this.httpClient.get('/api/v3/depth', {
        params: { symbol: symbol.toUpperCase(), limit }
      });
      
      return {
        bids: response.data.bids.map(b => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: response.data.asks.map(a => [parseFloat(a[0]), parseFloat(a[1])]),
        lastUpdateId: response.data.lastUpdateId
      };
    } catch (error) {
      throw new Error(`Failed to get order book: ${error.message}`);
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(symbol, limit = 100) {
    try {
      const response = await this.httpClient.get('/api/v3/trades', {
        params: { symbol: symbol.toUpperCase(), limit }
      });
      
      return response.data.map(trade => ({
        id: trade.id,
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.qty),
        time: trade.time,
        isBuyerMaker: trade.isBuyerMaker,
        isBestMatch: trade.isBestMatch
      }));
    } catch (error) {
      throw new Error(`Failed to get recent trades: ${error.message}`);
    }
  }

  /**
   * Get klines/candlesticks
   */
  async getKlines(symbol, interval = '1m', limit = 100) {
    try {
      const response = await this.httpClient.get('/api/v3/klines', {
        params: {
          symbol: symbol.toUpperCase(),
          interval,
          limit
        }
      });
      
      return response.data.map(k => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        quoteVolume: parseFloat(k[7]),
        trades: k[8],
        takerBuyBaseVolume: parseFloat(k[9]),
        takerBuyQuoteVolume: parseFloat(k[10])
      }));
    } catch (error) {
      throw new Error(`Failed to get klines: ${error.message}`);
    }
  }

  /**
   * Get ticker price
   */
  async getTickerPrice(symbol) {
    try {
      const response = await this.httpClient.get('/api/v3/ticker/price', {
        params: { symbol: symbol.toUpperCase() }
      });
      
      return {
        symbol: response.data.symbol,
        price: parseFloat(response.data.price)
      };
    } catch (error) {
      throw new Error(`Failed to get ticker price: ${error.message}`);
    }
  }

  /**
   * Get 24hr ticker statistics
   */
  async get24hrTicker(symbol) {
    try {
      const response = await this.httpClient.get('/api/v3/ticker/24hr', {
        params: { symbol: symbol.toUpperCase() }
      });
      
      return {
        symbol: response.data.symbol,
        priceChange: parseFloat(response.data.priceChange),
        priceChangePercent: parseFloat(response.data.priceChangePercent),
        weightedAvgPrice: parseFloat(response.data.weightedAvgPrice),
        prevClosePrice: parseFloat(response.data.prevClosePrice),
        lastPrice: parseFloat(response.data.lastPrice),
        lastQty: parseFloat(response.data.lastQty),
        bidPrice: parseFloat(response.data.bidPrice),
        askPrice: parseFloat(response.data.askPrice),
        openPrice: parseFloat(response.data.openPrice),
        highPrice: parseFloat(response.data.highPrice),
        lowPrice: parseFloat(response.data.lowPrice),
        volume: parseFloat(response.data.volume),
        quoteVolume: parseFloat(response.data.quoteVolume),
        openTime: response.data.openTime,
        closeTime: response.data.closeTime,
        firstId: response.data.firstId,
        lastId: response.data.lastId,
        count: response.data.count
      };
    } catch (error) {
      throw new Error(`Failed to get 24hr ticker: ${error.message}`);
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(symbol = null) {
    try {
      const timestamp = Date.now();
      let queryString = `timestamp=${timestamp}`;
      if (symbol) queryString += `&symbol=${symbol.toUpperCase()}`;
      
      const signature = this.generateSignature(queryString);
      
      const response = await this.httpClient.get('/api/v3/openOrders', {
        params: {
          timestamp,
          signature,
          ...(symbol && { symbol: symbol.toUpperCase() })
        }
      });
      
      return response.data.map(order => ({
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: parseFloat(order.origQty),
        executedQuantity: parseFloat(order.executedQty),
        price: parseFloat(order.price),
        status: order.status,
        timeInForce: order.timeInForce,
        time: order.time
      }));
    } catch (error) {
      throw new Error(`Failed to get open orders: ${error.message}`);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol, orderId) {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${symbol.toUpperCase()}&orderId=${orderId}&timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString);
      
      const response = await this.httpClient.delete('/api/v3/order', {
        params: {
          symbol: symbol.toUpperCase(),
          orderId,
          timestamp,
          signature
        }
      });
      
      return {
        success: true,
        orderId: response.data.orderId,
        clientOrderId: response.data.clientOrderId,
        symbol: response.data.symbol,
        status: response.data.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.msg || error.message
      };
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(symbol, orderId) {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${symbol.toUpperCase()}&orderId=${orderId}&timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString);
      
      const response = await this.httpClient.get('/api/v3/order', {
        params: {
          symbol: symbol.toUpperCase(),
          orderId,
          timestamp,
          signature
        }
      });
      
      return {
        orderId: response.data.orderId,
        clientOrderId: response.data.clientOrderId,
        symbol: response.data.symbol,
        side: response.data.side,
        type: response.data.type,
        quantity: parseFloat(response.data.origQty),
        executedQuantity: parseFloat(response.data.executedQty),
        price: parseFloat(response.data.price),
        status: response.data.status,
        timeInForce: response.data.timeInForce,
        time: response.data.time,
        updateTime: response.data.updateTime
      };
    } catch (error) {
      throw new Error(`Failed to get order status: ${error.message}`);
    }
  }

  /**
   * Get trade history
   */
  async getTradeHistory(symbol, limit = 100) {
    try {
      const timestamp = Date.now();
      const queryString = `symbol=${symbol.toUpperCase()}&timestamp=${timestamp}`;
      const signature = this.generateSignature(queryString);
      
      const response = await this.httpClient.get('/api/v3/myTrades', {
        params: {
          symbol: symbol.toUpperCase(),
          timestamp,
          signature,
          limit
        }
      });
      
      return response.data.map(trade => ({
        id: trade.id,
        orderId: trade.orderId,
        symbol: trade.symbol,
        side: trade.side,
        price: parseFloat(trade.price),
        quantity: parseFloat(trade.qty),
        quoteQuantity: parseFloat(trade.quoteQty),
        commission: parseFloat(trade.commission),
        commissionAsset: trade.commissionAsset,
        time: trade.time,
        isBuyer: trade.isBuyer,
        isMaker: trade.isMaker,
        isBestMatch: trade.isBestMatch
      }));
    } catch (error) {
      throw new Error(`Failed to get trade history: ${error.message}`);
    }
  }

  /**
   * Disconnect from API
   */
  async disconnect() {
    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      
      this.isConnected = false;
      this.wsSubscriptions.clear();
      
      console.log('✅ Disconnected from Binance API');
      return { success: true, message: 'Disconnected successfully' };
      
    } catch (error) {
      console.error('Failed to disconnect:', error);
      throw error;
    }
  }

  /**
   * Check API health
   */
  async checkHealth() {
    const health = {
      timestamp: Date.now(),
      restApi: false,
      websocket: false,
      rateLimit: this.rateLimits.weight,
      subscriptions: this.wsSubscriptions.size,
      marketData: {
        orderBooks: this.marketData.orderBooks.size,
        tickers: this.marketData.tickers.size,
        klines: this.marketData.klines.size,
        trades: this.marketData.trades.size
      }
    };
    
    try {
      // Test REST API
      await this.testConnection();
      health.restApi = true;
    } catch (error) {
      health.restApi = false;
      health.restError = error.message;
    }
    
    // Check WebSocket
    health.websocket = this.ws && this.ws.readyState === WebSocket.OPEN;
    
    health.healthy = health.restApi && health.websocket;
    
    return health;
  }

  /**
   * Get exchange information
   */
  async getExchangeInfo() {
    try {
      const response = await this.httpClient.get('/api/v3/exchangeInfo');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get exchange info: ${error.message}`);
    }
  }

  /**
   * Get server time
   */
  async getServerTime() {
    try {
      const response = await this.httpClient.get('/api/v3/time');
      return response.data.serverTime;
    } catch (error) {
      throw new Error(`Failed to get server time: ${error.message}`);
    }
  }

  /**
   * Test order placement (dry run)
   */
  async testOrder(order) {
    try {
      const params = {
        symbol: order.symbol.toUpperCase(),
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        quantity: parseFloat(order.quantity).toFixed(8),
        timestamp: Date.now()
      };
      
      if (order.price) params.price = parseFloat(order.price).toFixed(8);
      if (order.stopPrice) params.stopPrice = parseFloat(order.stopPrice).toFixed(8);
      if (order.type !== 'MARKET') params.timeInForce = order.timeInForce || 'GTC';
      
      params.signature = this.generateSignature(
        Object.keys(params)
          .sort()
          .map(key => `${key}=${params[key]}`)
          .join('&')
      );
      
      const response = await this.httpClient.post('/api/v3/order/test', null, { params });
      
      return {
        success: true,
        message: 'Order test passed',
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.msg || error.message,
        code: error.response?.data?.code
      };
    }
  }
}

module.exports = BinanceAPI;