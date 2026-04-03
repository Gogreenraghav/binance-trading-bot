/**
 * Risk Manager
 * Complete risk management system with position sizing, stop-loss, and limits
 */

class RiskManager {
  constructor(config) {
    this.config = {
      maxRiskPerTrade: config.maxRiskPerTrade || 2, // 2% per trade
      dailyLossLimit: config.dailyLossLimit || 5, // 5% daily loss limit
      maxOpenPositions: config.maxOpenPositions || 3,
      stopLossPercentage: config.stopLossPercentage || 2,
      takeProfitPercentage: config.takeProfitPercentage || 4,
      maxPortfolioRisk: config.maxPortfolioRisk || 20, // 20% total portfolio risk
      minRiskRewardRatio: config.minRiskRewardRatio || 1.5,
      volatilityAdjustment: config.volatilityAdjustment || true,
      kellyFraction: config.kellyFraction || 0.5, // Fraction of Kelly Criterion to use
      ...config
    };
    
    // Risk state tracking
    this.state = {
      dailyPnL: 0,
      dailyTrades: 0,
      openPositions: [],
      closedPositions: [],
      maxDrawdown: 0,
      peakBalance: 0,
      currentBalance: 0,
      riskExposure: 0,
      lastReset: Date.now()
    };
    
    // Risk metrics
    this.metrics = {
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      maxConsecutiveLosses: 0,
      maxConsecutiveWins: 0
    };
    
    // Risk limits
    this.limits = {
      dailyTrades: 50,
      hourlyTrades: 10,
      maxPositionSizeUSD: 10000,
      minPositionSizeUSD: 10,
      maxLeverage: 1, // No leverage by default
      minTimeBetweenTrades: 60000 // 1 minute
    };
    
    // Market conditions
    this.marketConditions = {
      volatility: 'medium',
      trend: 'neutral',
      sentiment: 'neutral',
      liquidity: 'high'
    };
    
    // Risk models
    this.models = {
      var95: 0, // Value at Risk 95%
      cvar95: 0, // Conditional VaR 95%
      expectedShortfall: 0
    };
    
    console.log('✅ Risk Manager initialized with config:', this.config);
  }

  /**
   * Check if trading is allowed
   */
  async canTrade() {
    const checks = [];
    
    // Daily loss limit check
    if (this.state.dailyPnL <= -this.config.dailyLossLimit) {
      checks.push({
        passed: false,
        reason: `Daily loss limit reached: ${this.state.dailyPnL.toFixed(2)}%`
      });
    } else {
      checks.push({
        passed: true,
        reason: `Daily PnL: ${this.state.dailyPnL.toFixed(2)}% (limit: ${this.config.dailyLossLimit}%)`
      });
    }
    
    // Open positions limit check
    if (this.state.openPositions.length >= this.config.maxOpenPositions) {
      checks.push({
        passed: false,
        reason: `Max open positions reached: ${this.state.openPositions.length}`
      });
    } else {
      checks.push({
        passed: true,
        reason: `Open positions: ${this.state.openPositions.length}/${this.config.maxOpenPositions}`
      });
    }
    
    // Portfolio risk check
    if (this.state.riskExposure >= this.config.maxPortfolioRisk) {
      checks.push({
        passed: false,
        reason: `Portfolio risk exposure limit reached: ${this.state.riskExposure.toFixed(2)}%`
      });
    } else {
      checks.push({
        passed: true,
        reason: `Portfolio risk: ${this.state.riskExposure.toFixed(2)}% (limit: ${this.config.maxPortfolioRisk}%)`
      });
    }
    
    // Daily trades limit check
    if (this.state.dailyTrades >= this.limits.dailyTrades) {
      checks.push({
        passed: false,
        reason: `Daily trade limit reached: ${this.state.dailyTrades}`
      });
    } else {
      checks.push({
        passed: true,
        reason: `Daily trades: ${this.state.dailyTrades}/${this.limits.dailyTrades}`
      });
    }
    
    // Time between trades check
    const lastTradeTime = this.state.openPositions.length > 0 
      ? Math.max(...this.state.openPositions.map(p => p.entryTime))
      : 0;
    
    const timeSinceLastTrade = Date.now() - lastTradeTime;
    if (timeSinceLastTrade < this.limits.minTimeBetweenTrades) {
      checks.push({
        passed: false,
        reason: `Minimum time between trades not met: ${Math.floor(timeSinceLastTrade / 1000)}s`
      });
    } else {
      checks.push({
        passed: true,
        reason: `Time since last trade: ${Math.floor(timeSinceLastTrade / 1000)}s`
      });
    }
    
    // Market conditions check
    if (this.marketConditions.volatility === 'high' && this.marketConditions.liquidity === 'low') {
      checks.push({
        passed: false,
        reason: 'Market conditions unfavorable: high volatility, low liquidity'
      });
    } else {
      checks.push({
        passed: true,
        reason: `Market conditions: ${this.marketConditions.volatility} volatility, ${this.marketConditions.liquidity} liquidity`
      });
    }
    
    const allPassed = checks.every(check => check.passed);
    
    return {
      canTrade: allPassed,
      checks,
      timestamp: Date.now()
    };
  }

  /**
   * Assess risk for a potential trade
   */
  async assessTrade(signal) {
    const assessment = {
      approved: false,
      maxPositionSize: 0,
      recommendedPositionSize: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskAmount: 0,
      rewardAmount: 0,
      riskRewardRatio: 0,
      kellyPosition: 0,
      reasons: [],
      warnings: [],
      timestamp: Date.now()
    };
    
    // Basic signal validation
    if (!signal || !signal.price || !signal.side) {
      assessment.reasons.push('Invalid signal: missing price or side');
      return assessment;
    }
    
    // Calculate stop loss and take profit if not provided
    const entryPrice = signal.price;
    const stopLoss = signal.stopLoss || this.calculateStopLoss(entryPrice, signal.side);
    const takeProfit = signal.takeProfit || this.calculateTakeProfit(entryPrice, signal.side);
    
    assessment.stopLoss = stopLoss;
    assessment.takeProfit = takeProfit;
    
    // Calculate risk/reward
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const rewardPerUnit = Math.abs(takeProfit - entryPrice);
    assessment.riskRewardRatio = rewardPerUnit / riskPerUnit;
    
    // Check minimum risk/reward ratio
    if (assessment.riskRewardRatio < this.config.minRiskRewardRatio) {
      assessment.reasons.push(`Risk/reward ratio too low: ${assessment.riskRewardRatio.toFixed(2)} (min: ${this.config.minRiskRewardRatio})`);
    } else {
      assessment.reasons.push(`Risk/reward ratio OK: ${assessment.riskRewardRatio.toFixed(2)}`);
    }
    
    // Calculate position size using multiple methods
    const accountBalance = this.state.currentBalance || 10000; // Default if not set
    const riskPerTrade = accountBalance * (this.config.maxRiskPerTrade / 100);
    
    // Method 1: Fixed fractional position sizing
    const fixedFractionalSize = riskPerTrade / riskPerUnit;
    
    // Method 2: Kelly Criterion position sizing
    const kellySize = this.calculateKellyPosition(accountBalance, riskPerUnit, rewardPerUnit);
    assessment.kellyPosition = kellySize;
    
    // Method 3: Volatility-adjusted position sizing
    const volatilityAdjustedSize = this.adjustForVolatility(fixedFractionalSize);
    
    // Determine final position size (use most conservative)
    let positionSize = Math.min(fixedFractionalSize, kellySize, volatilityAdjustedSize);
    
    // Apply limits
    positionSize = Math.max(
      this.limits.minPositionSizeUSD / entryPrice,
      Math.min(positionSize, this.limits.maxPositionSizeUSD / entryPrice)
    );
    
    assessment.maxPositionSize = positionSize;
    assessment.recommendedPositionSize = positionSize * 0.8; // Use 80% of max for safety
    
    // Calculate risk and reward amounts
    assessment.riskAmount = riskPerUnit * positionSize;
    assessment.rewardAmount = rewardPerUnit * positionSize;
    
    // Check if risk amount exceeds limits
    if (assessment.riskAmount > riskPerTrade) {
      assessment.warnings.push(`Risk amount (${assessment.riskAmount.toFixed(2)}) exceeds per-trade limit (${riskPerTrade.toFixed(2)})`);
      positionSize = riskPerTrade / riskPerUnit;
    }
    
    // Check portfolio risk exposure
    const newRiskExposure = this.state.riskExposure + (assessment.riskAmount / accountBalance * 100);
    if (newRiskExposure > this.config.maxPortfolioRisk) {
      assessment.reasons.push(`Portfolio risk would exceed limit: ${newRiskExposure.toFixed(2)}% (limit: ${this.config.maxPortfolioRisk}%)`);
    }
    
    // Market condition adjustments
    if (this.marketConditions.volatility === 'high') {
      positionSize *= 0.7; // Reduce position size by 30% in high volatility
      assessment.warnings.push('Reduced position size due to high volatility');
    }
    
    if (this.marketConditions.liquidity === 'low') {
      positionSize *= 0.8; // Reduce position size by 20% in low liquidity
      assessment.warnings.push('Reduced position size due to low liquidity');
    }
    
    // Final approval check
    const canTradeResult = await this.canTrade();
    if (!canTradeResult.canTrade) {
      assessment.reasons.push(...canTradeResult.checks.filter(c => !c.passed).map(c => c.reason));
    }
    
    assessment.approved = canTradeResult.canTrade && 
                         assessment.riskRewardRatio >= this.config.minRiskRewardRatio &&
                         assessment.reasons.length === 0;
    
    if (assessment.approved) {
      assessment.reasons.push('Trade approved');
    }
    
    return assessment;
  }

  /**
   * Calculate stop loss price
   */
  calculateStopLoss(entryPrice, side) {
    const stopLossPercentage = this.config.stopLossPercentage / 100;
    
    if (side === 'buy') {
      return entryPrice * (1 - stopLossPercentage);
    } else if (side === 'sell') {
      return entryPrice * (1 + stopLossPercentage);
    }
    
    return entryPrice;
  }

  /**
   * Calculate take profit price
   */
  calculateTakeProfit(entryPrice, side) {
    const takeProfitPercentage = this.config.takeProfitPercentage / 100;
    
    if (side === 'buy') {
      return entryPrice * (1 + takeProfitPercentage);
    } else if (side === 'sell') {
      return entryPrice * (1 - takeProfitPercentage);
    }
    
    return entryPrice;
  }

  /**
   * Calculate position size using Kelly Criterion
   */
  calculateKellyPosition(balance, riskPerUnit, rewardPerUnit) {
    // Simplified Kelly Criterion: f* = (bp - q) / b
    // where:
    // f* = fraction of bankroll to bet
    // b = net odds (reward/risk)
    // p = probability of winning
    // q = probability of losing (1 - p)
    
    // Use historical win rate as probability estimate
    const winRate = this.metrics.winRate || 0.5;
    const netOdds = rewardPerUnit / riskPerUnit;
    
    const kellyFraction = (winRate * netOdds - (1 - winRate)) / netOdds;
    
    // Apply Kelly fraction (use only a fraction of full Kelly for safety)
    const safeKellyFraction = Math.max(0, kellyFraction) * this.config.kellyFraction;
    
    // Convert to position size
    return (balance * safeKellyFraction) / riskPerUnit;
  }

  /**
   * Adjust position size for market volatility
   */
  adjustForVolatility(positionSize) {
    if (!this.config.volatilityAdjustment) {
      return positionSize;
    }
    
    let adjustmentFactor = 1.0;
    
    switch (this.marketConditions.volatility) {
      case 'low':
        adjustmentFactor = 1.2; // Increase size in low volatility
        break;
      case 'medium':
        adjustmentFactor = 1.0; // No adjustment
        break;
      case 'high':
        adjustmentFactor = 0.7; // Reduce size in high volatility
        break;
      case 'extreme':
        adjustmentFactor = 0.5; // Drastically reduce size
        break;
    }
    
    return positionSize * adjustmentFactor;
  }

  /**
   * Record a new trade
   */
  async recordTrade(trade) {
    const position = {
      id: trade.id || `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.price,
      quantity: trade.quantity,
      entryTime: Date.now(),
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      strategy: trade.strategy,
      riskAmount: Math.abs(trade.price - trade.stopLoss) * trade.quantity,
      status: 'open'
    };
    
    this.state.openPositions.push(position);
    this.state.dailyTrades++;
    
    // Update risk exposure
    const accountBalance = this.state.currentBalance || 10000;
    this.state.riskExposure += (position.riskAmount / accountBalance) * 100;
    
    console.log(`📊 Recorded trade: ${position.side} ${position.symbol} at ${position.entryPrice}`);
    
    return {
      success: true,
      positionId: position.id,
      riskExposure: this.state.riskExposure
    };
  }

  /**
   * Update a trade (close or modify)
   */
  async updateTrade(positionId, updateData) {
    const positionIndex = this.state.openPositions.findIndex(p => p.id === positionId);
    
    if (positionIndex === -1) {
      throw new Error(`Position ${positionId} not found`);
    }
    
    const position = this.state.openPositions[positionIndex];
    
    if (updateData.status === 'closed') {
      // Close position
      const closedPosition = {
        ...position,
        exitPrice: updateData.exitPrice,
        exitTime: Date.now(),
        pnl: updateData.pnl,
        pnlPercent: updateData.pnlPercent,
        status: 'closed'
      };
      
      // Move from open to closed
      this.state.openPositions.splice(positionIndex, 1);
      this.state.closedPositions.push(closedPosition);
      
      // Update daily PnL
      this.state.dailyPnL += updateData.pnlPercent;
      
      // Update risk exposure
      const accountBalance = this.state.currentBalance || 10000;
      this.state.riskExposure -= (position.riskAmount / accountBalance) * 100;
      
      // Update metrics
      await this.updateMetrics(closedPosition);
      
      // Update drawdown
      await this.updateDrawdown();
      
      console.log(`📊 Closed position: ${closedPosition.side} ${closedPosition.symbol} PnL: ${updateData.pnlPercent.toFixed(2)}%`);
      
    } else if (updateData.stopLoss || updateData.takeProfit) {
      // Modify position
      if (updateData.stopLoss) position.stopLoss = updateData.stopLoss;
      if (updateData.takeProfit) position.takeProfit = updateData.takeProfit;
      
      // Recalculate risk amount
      position.riskAmount = Math.abs(position.entryPrice - position.stopLoss) * position.quantity;
      
      console.log(`📊 Modified position ${positionId}: SL=${position.stopLoss}, TP=${position.takeProfit}`);
    }
    
    return { success: true, position };
  }

  /**
   * Update risk metrics based on closed position
   */
  async updateMetrics(position) {
    if (position.status !== 'closed' || position.pnlPercent === undefined) {
      return;
    }
    
    // Update win rate
    const isWin = position.pnlPercent > 0;
    const totalTrades = this.state.closedPositions.length;
    const winningTrades = this.state.closedPositions.filter(p => p.pnlPercent > 0).length;
