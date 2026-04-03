# Binance Trading Bot with News Sentiment Analysis

A sophisticated automated trading bot that integrates Binance API with real-time news sentiment analysis for intelligent trading decisions.

## Features

### ✅ Core Features
- **Real-time Market Data**: WebSocket connection to Binance for live price feeds
- **Automated Trading**: 5 built-in trading strategies
- **News Monitoring**: Real-time news aggregation with sentiment analysis
- **Risk Management**: Stop-loss, position sizing, and risk limits
- **Dashboard UI**: Comprehensive monitoring interface with charts
- **Error Handling**: Robust error recovery and logging system

### 📊 Trading Strategies
1. **Trend Following**: Identify and follow market trends
2. **Mean Reversion**: Trade based on price deviations from mean
3. **Breakout Trading**: Capture price breakouts from consolidation
4. **News-Based**: Execute trades based on news sentiment
5. **Arbitrage**: Exploit price differences across pairs

## Project Structure

```
trading-bot/
├── src/
│   ├── api/           # Binance API integration
│   ├── strategies/    # Trading strategies
│   ├── news/         # News monitoring system
│   ├── risk/         # Risk management
│   ├── ui/           # Dashboard interface
│   └── utils/        # Utility functions
├── tests/            # Test suite
├── config/           # Configuration files
├── docs/            # Documentation
└── scripts/         # Deployment scripts
```

## Installation

### Prerequisites
- Node.js 18+ 
- Binance API key (with trading permissions)
- News API key (optional)

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd trading-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start the bot
npm start
```

## Configuration

### Environment Variables
```env
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
NEWS_API_KEY=your_news_api_key
TRADING_PAIR=BTCUSDT
RISK_PERCENTAGE=2
```

### Trading Parameters
- **Risk per Trade**: 1-2% of portfolio
- **Stop Loss**: 2-5% below entry
- **Take Profit**: 4-10% above entry
- **Position Sizing**: Based on Kelly Criterion

## Usage

### Starting the Bot
```bash
# Development mode
npm run dev

# Production mode
npm start

# Test mode (paper trading)
npm run test-trade
```

### Dashboard Access
Once running, access the dashboard at:
- **Local**: http://localhost:3000
- **Features**: Real-time charts, trade history, news feed, performance metrics

## API Integration

### Binance API
- WebSocket for real-time data
- REST API for order management
- Testnet support for development
- Rate limit handling

### News API
- Real-time news aggregation
- Sentiment analysis (positive/negative/neutral)
- Market impact assessment
- Custom news sources

## Risk Management

### Built-in Protections
1. **Stop Loss**: Automatic position closing at defined loss
2. **Position Limits**: Maximum exposure per trade
3. **Daily Loss Limit**: Stop trading after daily loss threshold
4. **Market Hours**: Trade only during optimal hours
5. **Volatility Filter**: Avoid highly volatile conditions

## Testing

### Test Suite
```bash
# Run all tests
npm test

# Run specific tests
npm test -- --grep "API"

# Coverage report
npm run coverage
```

### Testnet Trading
Use Binance testnet for risk-free development:
```bash
# Configure for testnet
export BINANCE_TESTNET=true
npm start
```

## Deployment

### Docker Deployment
```bash
# Build image
docker build -t trading-bot .

# Run container
docker run -d --name trading-bot \
  -e BINANCE_API_KEY=your_key \
  -e BINANCE_API_SECRET=your_secret \
  trading-bot
```

### PM2 Process Manager
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js
```

## Performance Metrics

### Expected Results
- **Accuracy**: 55-65% win rate
- **Risk/Reward**: 1:2 minimum ratio
- **Daily Trades**: 5-15 trades
- **Monthly Return**: 5-15% (varies with market)

### Monitoring
- Real-time performance dashboard
- Trade history with profit/loss
- Risk exposure monitoring
- System health metrics

## Security

### Best Practices
1. **API Key Security**: Never commit API keys to repository
2. **Environment Variables**: Use .env files for configuration
3. **Rate Limiting**: Respect API rate limits
4. **Error Handling**: Graceful degradation on failures
5. **Backup Systems**: Regular database backups

### Risk Warning
⚠️ **Trading involves significant risk of loss**
- Only trade with risk capital
- Test thoroughly before live trading
- Monitor performance regularly
- Implement proper risk management

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check existing issues
2. Create new issue with detailed description
3. Include logs and configuration details

## Acknowledgments

- Binance for API access
- News API providers
- Open source trading libraries
- Community contributors

---

**Disclaimer**: This software is for educational purposes. Past performance does not guarantee future results. Trade at your own risk.