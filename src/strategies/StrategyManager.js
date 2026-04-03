/**
 * Strategy Manager
 * Complete implementation of 5 trading strategies with signal generation
 */

const technicalIndicators = require('technicalindicators');

class StrategyManager {
  constructor(config) {
    this.config = {
      strategies: config.strategies || ['trend', 'meanReversion', 'breakout', 'newsBased', 'arbitrage'],
      activeStrategy: config.activeStrategy || 'trend',
      strategyWeights: config.strategyWeights || {
        trend: 0.4,
        meanReversion: 0.3,
        breakout: 0.2,
        newsBased: 0.1,
        arbitrage: 0.0
      },
      ...config
    };
    
    this.strategies = {
      trend: new TrendFollowingStrategy(),
      meanReversion: new MeanReversionStrategy(),
      breakout: new BreakoutStrategy(),
      newsBased: new NewsBasedStrategy(),
      arbitrage: new ArbitrageStrategy()
    };
    
    this.history = {
      signals: [],
      performance: {},
      lastUpdate: Date.now()
    };
    
    // Strategy parameters
    this.parameters = {
      trend: {
        emaShort: 12,
        emaLong: 26,
        rsiPeriod: 14,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        minTrendStrength: 0.3
      },
      meanReversion: {
        bollingerPeriod: 20,
        bollingerStdDev: 2,
        rsiOversold: 30,
        rsiOverbought: 70,
        atrPeriod: 14,
        meanReversionThreshold: 1.5
      },
      breakout: {
        supportResistancePeriod: 20,
        breakoutConfirmation: 3,
        volumeSpikeThreshold: 2.0,
        minBreakoutStrength: 0.4
      },
      newsBased: {
        sentimentThreshold: 0.6,
        newsRecency: 3600000, // 1 hour
        impactWeight: 0.7,
        volumeWeight: 0.3
      },
      arbitrage: {
        priceDifferenceThreshold: 0.002, // 0.2%
        minVolume: 1000,
        maxExecutionTime: 5000 // 5 seconds
      }
    };
  }

  /**
   * Generate trading signals from all active strategies
   */
  async getSignals(marketAnalysis) {
    const signals = [];
    const activeStrategies = this.config.strategies.filter(s => 
      this.config.strategyWeights[s] > 0
    );
    
    for (const strategyName of activeStrategies) {
      try {
        const strategy = this.strategies[strategyName];
        const strategySignals = await strategy.generateSignals(marketAnalysis, this.parameters[strategyName]);
        
        // Apply strategy weight
        strategySignals.forEach(signal => {
          signal.strength *= this.config.strategyWeights[strategyName];
          signal.strategy = strategyName;
          signal.weight = this.config.strategyWeights[strategyName];
          signal.timestamp = Date.now();
        });
        
        signals.push(...strategySignals);
      } catch (error) {
        console.error(`Error in ${strategyName} strategy:`, error);
      }
    }
    
    // Filter and rank signals
    const filteredSignals = this.filterSignals(signals);
    const rankedSignals = this.rankSignals(filteredSignals);
    
    // Update history
    this.history.signals.push({
      timestamp: Date.now(),
      signals: rankedSignals,
      marketAnalysis
    });
    
    // Keep only last 1000 signal records
    if (this.history.signals.length > 1000) {
      this.history.signals.shift();
    }
    
    return rankedSignals;
  }

  /**
   * Filter signals based on quality and conditions
   */
  filterSignals(signals) {
    return signals.filter(signal => {
      // Minimum strength requirement
      if (signal.strength < 0.2) return false;
      
      // Valid side
      if (!['buy', 'sell'].includes(signal.side)) return false;
      
      // Valid price
      if (!signal.price || signal.price <= 0) return false;
      
      // Stop loss must be reasonable
      if (signal.stopLoss && signal.stopLoss <= 0) return false;
      
      // Take profit must be reasonable
      if (signal.takeProfit && signal.takeProfit <= 0) return false;
      
      // Risk/reward ratio check
      if (signal.stopLoss && signal.takeProfit) {
        const risk = Math.abs(signal.price - signal.stopLoss);
        const reward = Math.abs(signal.takeProfit - signal.price);
        const riskRewardRatio = reward / risk;
        
        if (riskRewardRatio < 1.5) return false; // Minimum 1.5:1 risk/reward
      }
      
      return true;
    });
  }

  /**
   * Rank signals by strength and quality
   */
  rankSignals(signals) {
    return signals
      .map(signal => {
        // Calculate composite score
        let score = signal.strength;
        
        // Boost score for high confidence signals
        if (signal.confidence && signal.confidence > 0.8) {
          score *= 1.2;
        }
        
        // Boost score for good risk/reward
        if (signal.stopLoss && signal.takeProfit) {
          const risk = Math.abs(signal.price - signal.stopLoss);
          const reward = Math.abs(signal.takeProfit - signal.price);
          const riskRewardRatio = reward / risk;
          
          if (riskRewardRatio > 2) score *= 1.1;
          if (riskRewardRatio > 3) score *= 1.2;
        }
        
        // Penalize signals during high volatility
        if (signal.marketVolatility === 'high') {
          score *= 0.8;
        }
        
        return { ...signal, score };
      })
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, 5); // Return top 5 signals
  }

  /**
   * Update strategy parameters based on performance
   */
  async updateParameters(performanceData) {
    // Adaptive parameter adjustment based on recent performance
    for (const [strategyName, performance] of Object.entries(performanceData)) {
      if (performance.winRate < 0.4) {
        // Reduce weight for poorly performing strategies
        this.config.strategyWeights[strategyName] *= 0.9;
      } else if (performance.winRate > 0.6) {
        // Increase weight for well-performing strategies
        this.config.strategyWeights[strategyName] *= 1.1;
      }
      
      // Ensure weights stay within bounds
      this.config.strategyWeights[strategyName] = Math.max(0.05, Math.min(0.8, this.config.strategyWeights[strategyName]));
    }
    
    // Normalize weights
    const totalWeight = Object.values(this.config.strategyWeights).reduce((a, b) => a + b, 0);
    Object.keys(this.config.strategyWeights).forEach(key => {
      this.config.strategyWeights[key] /= totalWeight;
    });
    
    console.log('Updated strategy weights:', this.config.strategyWeights);
  }

  /**
   * Backtest strategy on historical data
   */
  async backtest(strategyName, historicalData, parameters = null) {
    const strategy = this.strategies[strategyName];
    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }
    
    const testParams = parameters || this.parameters[strategyName];
    const signals = [];
    const trades = [];
    
    // Simulate trading on historical data
    for (let i = 50; i < historicalData.length; i++) {
      const window = historicalData.slice(Math.max(0, i - 100), i);
      const currentPrice = historicalData[i].close;
      
      const analysis = {
        prices: window.map(d => d.close),
        volumes: window.map(d => d.volume),
        highs: window.map(d => d.high),
        lows: window.map(d => d.low),
        currentPrice,
        timestamp: historicalData[i].timestamp
      };
      
      const strategySignals = await strategy.generateSignals(analysis, testParams);
      
      if (strategySignals.length > 0) {
        const signal = strategySignals[0];
        signals.push({
          timestamp: analysis.timestamp,
          price: currentPrice,
          signal: signal.side,
          strength: signal.strength
        });
        
        // Simulate trade execution
        if (signal.side === 'buy' || signal.side === 'sell') {
          trades.push({
            entryTime: analysis.timestamp,
            entryPrice: currentPrice,
            side: signal.side,
            exitTime: analysis.timestamp + 3600000, // 1 hour later (simplified)
            exitPrice: historicalData[Math.min(i + 60, historicalData.length - 1)].close,
            pnl: signal.side === 'buy' 
              ? (historicalData[Math.min(i + 60, historicalData.length - 1)].close - currentPrice) / currentPrice
              : (currentPrice - historicalData[Math.min(i + 60, historicalData.length - 1)].close) / currentPrice
          });
        }
      }
    }
    
    // Calculate performance metrics
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl <= 0);
    
    const performance = {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
      totalReturn: trades.reduce((sum, t) => sum + t.pnl, 0),
      avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0,
      profitFactor: winningTrades.length > 0 && losingTrades.length > 0 
        ? (winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length) 
        / Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
        : 0,
      maxDrawdown: this.calculateMaxDrawdown(trades),
      sharpeRatio: this.calculateSharpeRatio(trades)
    };
    
    return {
      strategy: strategyName,
      parameters: testParams,
      signals: signals.length,
      trades: performance,
      historicalPerformance: performance
    };
  }

  /**
   * Calculate maximum drawdown
   */
  calculateMaxDrawdown(trades) {
    if (trades.length === 0) return 0;
    
    let peak = trades[0].pnl;
    let maxDrawdown = 0;
    let runningTotal = 0;
    
    for (const trade of trades) {
      runningTotal += trade.pnl;
      peak = Math.max(peak, runningTotal);
      const drawdown = peak - runningTotal;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpeRatio(trades) {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.pnl);
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Assuming risk-free rate of 0 for crypto
    return stdDev > 0 ? meanReturn / stdDev * Math.sqrt(365) : 0;
  }

  /**
   * Get strategy performance statistics
   */
  getPerformanceStats() {
    const stats = {};
    
    for (const [strategyName, strategy] of Object.entries(this.strategies)) {
      const strategySignals = this.history.signals
        .flatMap(record => record.signals)
        .filter(signal => signal.strategy === strategyName);
      
      if (strategySignals.length > 0) {
        const avgStrength = strategySignals.reduce((sum, s) => sum + s.strength, 0) / strategySignals.length;
        const buySignals = strategySignals.filter(s => s.side === 'buy').length;
        const sellSignals = strategySignals.filter(s => s.side === 'sell').length;
        
        stats[strategyName] = {
          totalSignals: strategySignals.length,
          buySignals,
          sellSignals,
          buyRatio: strategySignals.length > 0 ? buySignals / strategySignals.length : 0,
          avgStrength,
          lastSignal: strategySignals.length > 0 ? strategySignals[strategySignals.length - 1].timestamp : null,
          weight: this.config.strategyWeights[strategyName] || 0
        };
      }
    }
    
    return stats;
  }

  /**
   * Check strategy manager health
   */
  async checkHealth() {
    const health = {
      timestamp: Date.now(),
      strategies: {},
      parameters: this.parameters,
      weights: this.config.strategyWeights,
      historySize: this.history.signals.length,
      performanceStats: this.getPerformanceStats()
    };
    
    for (const [name, strategy] of Object.entries(this.strategies)) {
      try {
        const strategyHealth = await strategy.checkHealth();
        health.strategies[name] = {
          healthy: true,
          ...strategyHealth
        };
      } catch (error) {
        health.strategies[name] = {
          healthy: false,
          error: error.message
        };
      }
    }
    
    health.healthy = Object.values(health.strategies).every(s => s.healthy);
    
    return health;
  }
}

/**
 * Trend Following Strategy
 * Identifies and follows market trends using moving averages and momentum indicators
 */
class TrendFollowingStrategy {
  constructor() {
    this.name = 'Trend Following';
    this.description = 'Identifies market trends using moving averages and momentum indicators';
  }

  async generateSignals(analysis, params) {
    const signals = [];
    const prices = analysis.prices;
    
    if (prices.length < Math.max(params.emaLong, params.rsiPeriod, params.macdSlow)) {
      return signals; // Not enough data
    }
    
    // Calculate indicators
    const emaShort = this.calculateEMA(prices, params.emaShort);
    const emaLong = this.calculateEMA(prices, params.emaLong);
    const rsi = this.calculateRSI(prices, params.rsiPeriod);
    const macd = this.calculateMACD(prices, params.macdFast, params.macdSlow, params.macdSignal);
    
    const currentPrice = analysis.currentPrice;
    const lastEmaShort = emaShort[emaShort.length - 1];
    const lastEmaLong = emaLong[emaLong.length - 1];
    const lastRSI = rsi[rsi.length - 1];
    const lastMACD = macd.macdLine[macd.macdLine.length - 1];
    const lastSignal = macd.signalLine[macd.signalLine.length - 1];
    const lastHistogram = macd.histogram[macd.histogram.length - 1];
    
    // Trend detection
    const emaTrend = lastEmaShort > lastEmaLong ? 1 : -1;
    const macdTrend = lastMACD > lastSignal ? 1 : -1;
    const priceAboveEMA = currentPrice > lastEmaLong;
    
    // Calculate trend strength
    const emaDistance = Math.abs(lastEmaShort - lastEmaLong) / lastEmaLong;
    const macdStrength = Math.abs(lastHistogram);
    const rsiStrength = Math.abs(lastRSI - 50) / 50;
    
    const trendStrength = (emaDistance * 0.4 + macdStrength * 0.4 + rsiStrength * 0.2);
    
    if (trendStrength < params.minTrendStrength) {
      return signals; // Trend too weak
    }
    
    // Generate signals
    if (emaTrend > 0 && macdTrend > 0 && priceAboveEMA && lastRSI < 70) {
      // Bullish trend
      signals.push({
        side: 'buy',
        strength: Math.min(trendStrength * 0.8, 0.9),
        confidence: 0.7,
        price: currentPrice,
        stopLoss: currentPrice * 0.97,
        takeProfit: currentPrice * 1.06,
        indicators: {
          emaTrend,
          macdTrend,
          rsi: lastRSI,
          trendStrength
        }
      });
    } else if (emaTrend < 0 && macdTrend < 0 && !priceAboveEMA && lastRSI > 30) {
      // Bearish trend
      signals.push({
        side: 'sell',
        strength: Math.min(trendStrength * 0.8, 0.9),
        confidence: 0.7,
        price: currentPrice,
        stopLoss: currentPrice * 1.03,
        takeProfit: currentPrice * 0.94,
        indicators: {
          emaTrend,
          macdTrend,
          rsi: lastRSI,
          trendStrength
        }
      });
    }
    
    return signals;
  }

  calculateEMA(prices, period) {
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA
    let sma = 0;
    for (let i = 0; i < period && i < prices.length; i++) {
      sma += prices[i];
    }
    sma /= Math.min(period, prices.length);
    ema.push(sma);
    
    // Calculate EMA for remaining prices
    for (let i = period; i < prices.length; i++) {
      const currentEMA = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
      ema.push(currentEMA);
    }
    
    return ema;
  }

  calculateRSI(prices, period) {
    const rsi = [];
    
    if (prices.length < period + 1) {
      return rsi;
    }
    
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average gains and losses
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate first RSI
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    
    // Calculate remaining RSI values
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      let currentGain = 0;
      let currentLoss = 0;
      
      if (change > 0) {
        currentGain = change;
      } else {
        currentLoss = Math.abs(change);
      }
      
      avgGain = ((avgGain * (period - 1)) + currentGain) / period;
      avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
      
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
    
    return rsi;
  }

  calculateMACD(prices, fastPeriod, slowPeriod, signalPeriod) {
    const emaFast = this.calculateEMA(prices, fastPeriod);
    const emaSlow = this.calculateEMA(prices, slowPeriod);
    
    // Calculate MACD line (fast EMA - slow EMA)
    const macdLine = [];
    const startIndex = Math.max(emaFast.length - emaSlow.length, 0);
    
    for (let i = 0; i < emaSlow.length; i++) {
      if (i + startIndex < emaFast.length) {
        macdLine.push(emaFast[i + startIndex] - emaSlow[i]);
      }
    }
    
    // Calculate signal line (EMA of MACD line)
    const signalLine = this.calculateEMA(macdLine, signalPeriod);
    
    // Calculate histogram (MACD line - signal line)
    const histogram = [];
    const signalStartIndex = Math.max(macdLine.length - signalLine.length, 0);
    
    for (let i = 0; i < signalLine.length; i++) {
      if (i + signalStartIndex < macdLine.length) {
        histogram.push(macdLine[i + signalStartIndex] - signalLine[i]);
      }
    }
    
    return {
      macdLine,
      signalLine,
      histogram
    };
  }

  async checkHealth() {
    return {
      healthy: true,
      name: this.name,
      description: this.description,
      timestamp: Date.now()
    };
  }
}

/**
 * Mean Reversion Strategy
 * Trades based on price deviations from mean with Bollinger Bands and RSI
 */
class MeanReversionStrategy {
  constructor() {
    this.name = 'Mean Reversion';
    this.description = 'Trades based on price deviations from mean using Bollinger Bands and RSI';
  }

  async generateSignals(analysis, params) {
    const signals = [];
    const prices = analysis.prices;
    
    if (prices.length < params.bollingerPeriod) {
      return signals;
    }
    
    // Calculate Bollinger Bands
    const bollinger = this.calculateBollingerBands(prices, params.bollingerPeriod, params.bollingerStdDev);
    const rsi = this.calculateRSI(prices, 14);
    
    const currentPrice = analysis.currentPrice;
    const lastUpper = bollinger.upper[bollinger.upper.length - 1];
    const lastLower = bollinger.lower[bollinger.lower.length - 1];
    const lastMiddle = bollinger.middle[bollinger.middle.length - 1];
    const lastRSI = rsi[rsi.length - 1];
    
    // Calculate deviation from mean
    const deviation = (currentPrice - lastMiddle) / lastMiddle;
    const bandWidth = (lastUpper - lastLower) / lastMiddle;
    
    // Generate signals
    if (currentPrice <= lastLower && lastRSI < params.rsiOversold && Math.abs(deviation) > params.meanReversionThreshold * bandWidth) {
      // Price at lower band, oversold RSI - Buy signal
      signals.push({
        side: 'buy',
        strength: Math.min((params.rsiOversold - lastRSI) / params.rsiOversold * 0.8, 0.9),
        confidence: 0.65,
        price: currentPrice,
        stopLoss: currentPrice * 0.98,
        takeProfit: lastMiddle,
        indicators: {
          deviation,
          bandWidth,
          rsi: lastRSI,
          position: 'lowerBand'
        }
      });
    } else if (currentPrice >= lastUpper && lastRSI > params.rsiOverbought && Math.abs(deviation) > params.meanReversionThreshold * bandWidth) {
      // Price at upper band, overbought RSI - Sell signal
      signals.push({
        side: 'sell',
        strength: Math.min((lastRSI - params.rsiOverbought) / (100 - params.rsiOverbought) * 0.8, 0.9),
        confidence: 0.65,
        price: currentPrice,
        stopLoss: currentPrice * 1.02,
        takeProfit: lastMiddle,
        indicators: {
          deviation,
          bandWidth,
          rsi: lastRSI,
          position: 'upperBand'
        }
      });
    }
    
    return signals;
  }

  calculateBollingerBands(prices, period, stdDev) {
    const middle = [];
    const upper = [];
    const lower = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      middle.push(mean);
      upper.push(mean + (standardDeviation * stdDev));
      lower.push(mean - (standardDeviation * stdDev));
    }
    
    return { middle, upper, lower };
  }

  calculateRSI(prices, period) {
    // Reuse RSI calculation from TrendFollowingStrategy
    const trendStrategy = new TrendFollowingStrategy();
    return trendStrategy.calculateRSI(prices, period);
  }

  async checkHealth() {
    return {
      healthy: true,
      name: this.name,
      description: this.description,
      timestamp: Date.now()
    };
  }
}

/**
 * Breakout Strategy
 * Identifies and trades breakouts from consolidation patterns
 */
class BreakoutStrategy {
  constructor() {
    this.name = 'Breakout';
    this.description = 'Identifies and trades breakouts from consolidation patterns';
  }

  async generateSignals(analysis, params) {
    const signals = [];
    const prices = analysis.prices;
    const highs = analysis.highs;
    const lows = analysis.lows;
    const volumes = analysis.volumes;
    
    if (prices.length < params.supportResistancePeriod * 2) {
      return signals;
    }
    
    // Identify support and resistance levels
    const levels = this.identifySupportResistance(highs, lows, params.supportResistancePeriod);
    const currentPrice = analysis.currentPrice;
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    
    // Check for breakouts
    for (const level of levels.resistance) {
      if (currentPrice > level.price && 
          currentPrice > level.price * 1.01 && // 1% above resistance
          currentVolume > avgVolume * params.volumeSpikeThreshold) {
        
        // Resistance breakout - Buy signal
        const breakoutStrength = Math.min(
          (currentPrice - level.price) / level.price * 10,
          0.9
        );
        
        if (breakoutStrength > params.minBreakoutStrength) {
          signals.push({
            side: 'buy',
            strength: breakoutStrength,
            confidence: 0.6,
            price: currentPrice,
            stopLoss: level.price * 0.99,
            takeProfit: currentPrice * 1.08,
            indicators: {
              breakoutLevel: level.price,
              volumeRatio: currentVolume / avgVolume,
              confirmation: 1
            }
          });
        }
      }
    }
    
    for (const level of levels.support) {
      if (currentPrice < level.price && 
          currentPrice < level.price * 0.99 && // 1% below support
          currentVolume > avgVolume * params.volumeSpikeThreshold) {
        
        // Support breakdown - Sell signal
        const breakdownStrength = Math.min(
          (level.price - currentPrice) / level.price * 10,
          0.9
        );
        
        if (breakdownStrength > params.minBreakoutStrength) {
          signals.push({
            side: 'sell',
            strength: breakdownStrength,
            confidence: 0.6,
            price: currentPrice,
            stopLoss: level.price * 1.01,
            takeProfit: currentPrice * 0.92,
            indicators: {
              breakdownLevel: level.price,
              volumeRatio: currentVolume / avgVolume,
              confirmation: 1
            }
          });
        }
      }
    }
    
    return signals;
  }

  identifySupportResistance(highs, lows, period) {
    const resistance = [];
    const support = [];
    
    // Simple peak/trough detection
    for (let i = period; i < highs.length - period; i++) {
      const highWindow = highs.slice(i - period, i + period + 1);
      const lowWindow = lows.slice(i - period, i + period + 1);
      
      const currentHigh = highs[i];
      const currentLow = lows[i];
      
      // Check for resistance (local high)
      if (currentHigh === Math.max(...highWindow)) {
        resistance.push({
          price: currentHigh,
          index: i,
          strength: 1
        });
      }
      
      // Check for support (local low)
      if (currentLow === Math.min(...lowWindow)) {
        support.push({
          price: currentLow,
          index: i,
          strength: 1
        });
      }
    }
    
    // Merge nearby levels
    const mergedResistance = this.mergeLevels(resistance, 0.005); // 0.5% merge threshold
    const mergedSupport = this.mergeLevels(support, 0.005);
    
    return {
      resistance: mergedResistance.slice(-5), // Last 5 resistance levels
      support: mergedSupport.slice(-5) // Last 5 support levels
    };
  }

  mergeLevels(levels, threshold) {
    if (levels.length === 0) return [];
    
    const merged = [];
    levels.sort((a, b) => a.price - b.price);
    
    let currentGroup = [levels[0]];
    
    for (let i = 1; i < levels.length; i++) {
      const lastPrice = currentGroup[currentGroup.length - 1].price;
      const currentPrice = levels[i].price;
      
      if (Math.abs(currentPrice - lastPrice) / lastPrice <= threshold) {
        currentGroup.push(levels[i]);
      } else {
        // Average the group
        const avgPrice = currentGroup.reduce((sum, level) => sum + level.price, 0) / currentGroup.length;
        const maxStrength = Math.max(...currentGroup.map(l => l.strength));
        
        merged.push({
          price: avgPrice,
          strength: maxStrength,
          occurrences: currentGroup.length
        });
        
        currentGroup = [levels[i]];
      }
    }
    
    // Add last group
    if (currentGroup.length > 0) {
      const avgPrice = currentGroup.reduce((sum, level) => sum + level.price, 0) / currentGroup.length;
      const maxStrength = Math.max(...currentGroup.map(l => l.strength));
      
      merged.push({
        price: avgPrice,
        strength: maxStrength,
        occurrences: currentGroup.length
      });
    }
    
    return merged;
  }

  async checkHealth() {
    return {
      healthy: true,
      name: this.name,
      description: this.description,
      timestamp: Date.now()
    };
  }
}

/**
 * News Based Strategy
 * Trades based on news sentiment analysis
 */
class NewsBasedStrategy {
  constructor() {
    this.name = 'News Based';
    this.description = 'Trades based on news sentiment analysis';
  }

  async generateSignals(analysis, params) {
    const signals = [];
    
    // This strategy requires news data from the market analysis
    if (!analysis.news || !analysis.news.sentiment) {
      return signals;
    }
    
    const sentiment = analysis.news.sentiment;
    const sentimentScore = analysis.news.score || 0;
    const currentPrice = analysis.currentPrice;
    const volume = analysis.volumes ? analysis.volumes[analysis.volumes.length - 1] : 0;
    const avgVolume = analysis.volumes ? 
      analysis.volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, analysis.volumes.length) : 0;
    
    // Check if news is recent
    const newsAge = Date.now() - (analysis.news.timestamp || 0);
    if (newsAge > params.newsRecency) {
      return signals; // News too old
    }
    
    // Generate signals based on sentiment
    if (sentiment === 'positive' && sentimentScore > params.sentimentThreshold) {
      const volumeFactor = volume > avgVolume * 1.5 ? 1.2 : 1.0;
      const strength = Math.min(sentimentScore * params.impactWeight + (volume / avgVolume) * params.volumeWeight, 0.9);
      
      signals.push({
        side: 'buy',
        strength: strength * volumeFactor,
        confidence: 0.55,
        price: currentPrice,
        stopLoss: currentPrice * 0.98,
        takeProfit: currentPrice * 1.05,
        indicators: {
          sentiment,
          sentimentScore,
          volumeRatio: volume / avgVolume,
          newsAge
        }
      });
    } else if (sentiment === 'negative' && sentimentScore > params.sentimentThreshold) {
      const volumeFactor = volume > avgVolume * 1.5 ? 1.2 : 1.0;
      const strength = Math.min(sentimentScore * params.impactWeight + (volume / avgVolume) * params.volumeWeight, 0.9);
      
      signals.push({
        side: 'sell',
        strength: strength * volumeFactor,
        confidence: 0.55,
        price: currentPrice,
        stopLoss: currentPrice * 1.02,
        takeProfit: currentPrice * 0.95,
        indicators: {
          sentiment,
          sentimentScore,
          volumeRatio: volume / avgVolume,
          newsAge
        }
      });
    }
    
    return signals;
  }

  async checkHealth() {
    return {
      healthy: true,
      name: this.name,
      description: this.description,
      timestamp: Date.now()
    };
  }
}

/**
 * Arbitrage Strategy
 * Identifies price differences across markets (simplified version)
 */
class ArbitrageStrategy {
  constructor() {
    this.name = 'Arbitrage';
    this.description = 'Identifies price differences across markets for arbitrage opportunities';
  }

  async generateSignals(analysis, params) {
    const signals = [];
    
    // This strategy requires multiple market data points
    // For simplicity, we'll simulate finding price differences
    
    // In a real implementation, this would compare prices across
    //
