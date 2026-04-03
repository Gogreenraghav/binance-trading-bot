/**
 * News Monitor
 * Complete news aggregation and sentiment analysis system
 */

const axios = require('axios');
const natural = require('natural');
const { SentimentAnalyzer, PorterStemmer } = natural;
const cron = require('node-cron');

class NewsMonitor {
  constructor(config) {
    this.config = {
      apiKey: config.apiKey || '',
      sources: config.sources || ['reuters', 'bloomberg', 'coindesk', 'cryptopanic'],
      updateInterval: config.updateInterval || 300000, // 5 minutes
      sentimentThreshold: config.sentimentThreshold || 0.3,
      maxNewsAge: config.maxNewsAge || 86400000, // 24 hours
      ...config
    };
    
    this.newsItems = [];
    this.sentiment = 'neutral';
    this.sentimentScore = 0;
    this.lastUpdate = null;
    this.isRunning = false;
    this.updateJob = null;
    
    // Initialize sentiment analyzer
    this.sentimentAnalyzer = new SentimentAnalyzer('English', PorterStemmer, 'afinn');
    
    // News sources configuration
    this.newsSources = {
      cryptopanic: {
        name: 'CryptoPanic',
        url: 'https://cryptopanic.com/api/v1/posts/',
        params: {
          auth_token: this.config.apiKey,
          public: 'true',
          filter: 'important'
        },
        parser: this.parseCryptoPanic.bind(this)
      },
      coindesk: {
        name: 'CoinDesk',
        url: 'https://api.coindesk.com/v1/bpi/currentprice.json',
        parser: this.parseCoinDesk.bind(this)
      },
      // Additional sources would be added here
    };
    
    // Keywords for crypto/news relevance
    this.keywords = {
      bitcoin: ['bitcoin', 'btc', 'satoshi', 'halving', 'mining'],
      ethereum: ['ethereum', 'eth', 'vitalik', 'smart contract', 'defi'],
      crypto: ['cryptocurrency', 'crypto', 'blockchain', 'digital asset', 'token'],
      market: ['market', 'price', 'trading', 'exchange', 'volume', 'liquidity'],
      regulation: ['regulation', 'sec', 'cfdc', 'legal', 'law', 'government', 'ban'],
      technology: ['technology', 'upgrade', 'fork', 'protocol', 'network', 'scalability']
    };
    
    // Sentiment lexicon
    this.sentimentLexicon = {
      positive: [
        'bullish', 'surge', 'rally', 'gain', 'increase', 'growth', 'adoption',
        'partnership', 'integration', 'support', 'approval', 'breakthrough',
        'innovation', 'record', 'high', 'success', 'profit', 'win', 'positive'
      ],
      negative: [
        'bearish', 'crash', 'drop', 'decline', 'loss', 'decrease', 'risk',
        'warning', 'fraud', 'scam', 'hack', 'theft', 'regulation', 'ban',
        'restriction', 'lawsuit', 'investigation', 'failure', 'negative'
      ],
      neutral: [
        'stable', 'neutral', 'unchanged', 'maintain', 'continue', 'update',
        'announcement', 'release', 'report', 'analysis', 'forecast', 'prediction'
      ]
    };
  }

  /**
   * Initialize news monitor
   */
  async initialize() {
    try {
      console.log('📰 Initializing News Monitor...');
      
      // Load initial news
      await this.fetchAllNews();
      
      // Analyze initial sentiment
      await this.analyzeSentiment();
      
      console.log('✅ News Monitor initialized');
      return { success: true, message: 'News Monitor initialized' };
      
    } catch (error) {
      console.error('❌ Failed to initialize News Monitor:', error);
      throw error;
    }
  }

  /**
   * Start automatic news updates
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ News Monitor is already running');
      return { success: false, message: 'Already running' };
    }
    
    try {
      // Schedule regular updates
      this.updateJob = cron.schedule(`*/${Math.floor(this.config.updateInterval / 60000)} * * * *`, async () => {
        console.log('🔄 Scheduled news update');
        await this.fetchAllNews();
        await this.analyzeSentiment();
      });
      
      this.isRunning = true;
      console.log('✅ News Monitor started');
      return { success: true, message: 'News Monitor started' };
      
    } catch (error) {
      console.error('❌ Failed to start News Monitor:', error);
      throw error;
    }
  }

  /**
   * Stop news updates
   */
  async stop() {
    if (!this.isRunning) {
      return { success: false, message: 'Not running' };
    }
    
    try {
      if (this.updateJob) {
        this.updateJob.stop();
        this.updateJob = null;
      }
      
      this.isRunning = false;
      console.log('✅ News Monitor stopped');
      return { success: true, message: 'News Monitor stopped' };
      
    } catch (error) {
      console.error('❌ Failed to stop News Monitor:', error);
      throw error;
    }
  }

  /**
   * Fetch news from all configured sources
   */
  async fetchAllNews() {
    const promises = [];
    
    for (const sourceName of this.config.sources) {
      if (this.newsSources[sourceName]) {
        promises.push(this.fetchFromSource(sourceName));
      }
    }
    
    try {
      const results = await Promise.allSettled(promises);
      const newItems = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          newItems.push(...result.value);
        } else {
          console.error(`Failed to fetch from source ${this.config.sources[index]}:`, result.reason);
        }
      });
      
      // Add new items and remove duplicates
      this.addNewsItems(newItems);
      
      // Remove old news
      this.removeOldNews();
      
      this.lastUpdate = Date.now();
      console.log(`📊 Fetched ${newItems.length} new news items, total: ${this.newsItems.length}`);
      
    } catch (error) {
      console.error('Error fetching news:', error);
    }
  }

  /**
   * Fetch news from a specific source
   */
  async fetchFromSource(sourceName) {
    const source = this.newsSources[sourceName];
    if (!source) {
      throw new Error(`Unknown news source: ${sourceName}`);
    }
    
    try {
      const response = await axios.get(source.url, { params: source.params });
      return source.parser(response.data);
      
    } catch (error) {
      console.error(`Error fetching from ${sourceName}:`, error.message);
      return [];
    }
  }

  /**
   * Parse CryptoPanic API response
   */
  parseCryptoPanic(data) {
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }
    
    return data.results.map(item => ({
      id: `cryptopanic_${item.id}`,
      title: item.title,
      description: item.metadata?.description || '',
      url: item.url,
      source: 'CryptoPanic',
      publishedAt: new Date(item.published_at).getTime(),
      votes: {
        positive: item.votes?.positive || 0,
        negative: item.votes?.negative || 0,
        important: item.votes?.important || 0
      },
      currencies: item.currencies || [],
      metadata: item.metadata || {}
    }));
  }

  /**
   * Parse CoinDesk API response
   */
  parseCoinDesk(data) {
    // CoinDesk doesn't have a news API in the free tier
    // This is a placeholder for when we have proper API access
    return [{
      id: `coindesk_${Date.now()}`,
      title: 'Bitcoin Price Update',
      description: `Current Bitcoin price: $${data.bpi?.USD?.rate || 'N/A'}`,
      url: 'https://www.coindesk.com',
      source: 'CoinDesk',
      publishedAt: Date.now(),
      votes: { positive: 0, negative: 0, important: 0 },
      currencies: [{ code: 'BTC', title: 'Bitcoin' }],
      metadata: { price: data.bpi?.USD?.rate }
    }];
  }

  /**
   * Add news items with deduplication
   */
  addNewsItems(newItems) {
    const existingIds = new Set(this.newsItems.map(item => item.id));
    
    newItems.forEach(item => {
      if (!existingIds.has(item.id)) {
        // Analyze item sentiment
        item.sentiment = this.analyzeItemSentiment(item);
        item.relevance = this.calculateRelevance(item);
        
        this.newsItems.push(item);
        existingIds.add(item.id);
      }
    });
    
    // Sort by relevance and recency
    this.newsItems.sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      return b.publishedAt - a.publishedAt;
    });
  }

  /**
   * Remove news items older than max age
   */
  removeOldNews() {
    const cutoffTime = Date.now() - this.config.maxNewsAge;
    const initialCount = this.newsItems.length;
    
    this.newsItems = this.newsItems.filter(item => item.publishedAt >= cutoffTime);
    
    if (this.newsItems.length < initialCount) {
      console.log(`🗑️ Removed ${initialCount - this.newsItems.length} old news items`);
    }
  }

  /**
   * Analyze sentiment of a news item
   */
  analyzeItemSentiment(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    
    // Use AFINN sentiment analysis
    let sentimentScore = 0;
    try {
      sentimentScore = this.sentimentAnalyzer.getSentiment(text.split(' '));
    } catch (error) {
      sentimentScore = 0;
    }
    
    // Check for keywords in sentiment lexicon
    let keywordScore = 0;
    let keywordCount = 0;
    
    for (const [sentiment, words] of Object.entries(this.sentimentLexicon)) {
      for (const word of words) {
        if (text.includes(word)) {
          keywordCount++;
          if (sentiment === 'positive') keywordScore += 1;
          if (sentiment === 'negative') keywordScore -= 1;
        }
      }
    }
    
    // Combine scores
    const combinedScore = (sentimentScore + (keywordScore / Math.max(1, keywordCount))) / 2;
    
    // Determine sentiment category
    if (combinedScore > this.config.sentimentThreshold) {
      return { sentiment: 'positive', score: combinedScore };
    } else if (combinedScore < -this.config.sentimentThreshold) {
      return { sentiment: 'negative', score: Math.abs(combinedScore) };
    } else {
      return { sentiment: 'neutral', score: 0 };
    }
  }

  /**
   * Calculate relevance of a news item
   */
  calculateRelevance(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    let relevance = 0;
    
    // Check for cryptocurrency keywords
    for (const [category, keywords] of Object.entries(this.keywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          relevance += 1;
          break;
        }
      }
    }
    
    // Boost relevance for recent news
    const age = Date.now() - item.publishedAt;
    const ageFactor = Math.max(0, 1 - (age / this.config.maxNewsAge));
    relevance *= (1 + ageFactor);
    
    // Boost relevance for important votes (CryptoPanic specific)
    if (item.votes?.important > 0) {
      relevance *= 1.5;
    }
    
    return relevance;
  }

  /**
   * Analyze overall market sentiment
   */
  async analyzeSentiment() {
    if (this.newsItems.length === 0) {
      this.sentiment = 'neutral';
      this.sentimentScore = 0;
      return;
    }
    
    // Calculate weighted sentiment
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const item of this.newsItems) {
      const weight = item.relevance;
      const itemScore = item.sentiment.score;
      
      if (item.sentiment.sentiment === 'positive') {
        totalScore += itemScore * weight;
      } else if (item.sentiment.sentiment === 'negative') {
        totalScore -= itemScore * weight;
      }
      
      totalWeight += weight;
    }
    
    const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    // Determine overall sentiment
    if (avgScore > this.config.sentimentThreshold) {
      this.sentiment = 'positive';
      this.sentimentScore = avgScore;
    } else if (avgScore < -this.config.sentimentThreshold) {
      this.sentiment = 'negative';
      this.sentimentScore = Math.abs(avgScore);
    } else {
      this.sentiment = 'neutral';
      this.sentimentScore = 0;
    }
    
    console.log(`📈 Market sentiment: ${this.sentiment} (score: ${this.sentimentScore.toFixed(3)})`);
  }

  /**
   * Get current market sentiment
   */
  async getSentiment() {
    return {
      sentiment: this.sentiment,
      score: this.sentimentScore,
      timestamp: this.lastUpdate || Date.now(),
      newsCount: this.newsItems.length,
      sampleNews: this.newsItems.slice(0, 3).map(item => ({
        title: item.title,
        sentiment: item.sentiment.sentiment,
        relevance: item.relevance
      }))
    };
  }

  /**
   * Get news items by filter
   */
  async getNews(filter = {}) {
    let filtered = [...this.newsItems];
    
    if (filter.sentiment) {
      filtered = filtered.filter(item => item.sentiment.sentiment === filter.sentiment);
    }
    
    if (filter.source) {
      filtered = filtered.filter(item => item.source === filter.source);
    }
    
    if (filter.minRelevance) {
      filtered = filtered.filter(item => item.relevance >= filter.minRelevance);
    }
    
    if (filter.maxAge) {
      const cutoffTime = Date.now() - filter.maxAge;
      filtered = filtered.filter(item => item.publishedAt >= cutoffTime);
    }
    
    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }

  /**
   * Search news by keyword
   */
  async searchNews(keyword) {
    const searchTerm = keyword.toLowerCase();
    
    return this.newsItems.filter(item => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      return text.includes(searchTerm);
    });
  }

  /**
   * Get sentiment trends over time
   */
  async getSentimentTrend(hours = 24) {
    const cutoffTime = Date.now() - (hours * 3600000);
    const recentNews = this.newsItems.filter(item => item.publishedAt >= cutoffTime);
    
    if (recentNews.length === 0) {
      return { trend: 'neutral', change: 0, sampleSize: 0 };
    }
    
    // Calculate sentiment for recent period
    let recentScore = 0;
    let recentWeight = 0;
    
    for (const item of recentNews) {
      const weight = item.relevance;
      const itemScore = item.sentiment.score;
      
      if (item.sentiment.sentiment === 'positive') {
        recentScore += itemScore * weight;
      } else if (item.sentiment.sentiment === 'negative') {
        recentScore -= itemScore * weight;
      }
      
      recentWeight += weight;
    }
    
    const recentAvgScore = recentWeight > 0 ? recentScore / recentWeight : 0;
    
    // Compare with overall sentiment
    const change = recentAvgScore - this.sentimentScore;
    
    let trend = 'stable';
    if (Math.abs(change) > this.config.sentimentThreshold * 0.5) {
      trend = change > 0 ? 'improving' : 'worsening';
    }
    
    return {
      trend,
      change,
      recentScore: recentAvgScore,
      overallScore: this.sentimentScore,
      sampleSize: recentNews.length,
      hours
    };
  }

  /**
   * Check news monitor health
   */
  async checkHealth() {
    const health = {
      timestamp: Date.now(),
      isRunning: this.isRunning,
      lastUpdate: this.lastUpdate,
      newsCount: this.newsItems.length,
      sentiment: this.sentiment,
      sentimentScore: this.sentimentScore,
      sources: this.config.sources.map(source => ({
        name: source,
        configured: !!this.newsSources[source]
      })),
      updateInterval: this.config.updateInterval,
      maxNewsAge: this.config.maxNewsAge
    };
    
    // Check if we can fetch news
    try {
      // Test one source
      const testSource = this.config.sources[0];
      if (testSource && this.newsSources[testSource]) {
        const testData = await this.fetchFromSource(testSource);
        health.fetchTest = {
          success: true,
          items: testData.length,
          source: testSource
        };
      } else {
        health.fetchTest = {
          success: false,
          error: 'No valid source to test'
        };
      }
    } catch (error) {
      health.fetchTest = {
        success: false,
        error: error.message
      };
    }
    
    health.healthy = health.isRunning && health.newsCount > 0 && health.fetchTest.success !== false;
    
    return health;
  }

  /**
   * Get statistics about news coverage
   */
  async getStatistics() {
    const stats = {
      totalNews: this.newsItems.length,
      bySentiment: {
        positive: 0,
        negative: 0,
        neutral: 0
      },
      bySource: {},
      byHour: {},
      avgRelevance: 0,
      avgSentimentScore: 0
    };
    
    if (this.newsItems.length === 0) {
      return stats;
    }
    
    let totalRelevance = 0;
    let totalSentimentScore = 0;
    
    // Calculate statistics
    for (const item of this.newsItems) {
      // Sentiment distribution
      stats.bySentiment[item.sentiment.sentiment]++;
      
      // Source distribution
      stats.bySource[item.source] = (stats.bySource[item.source] || 0) + 1;
      
      // Hour distribution
      const hour = new Date(item.publishedAt).getHours();
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
      
      // Averages
      totalRelevance += item.relevance;
      totalSentimentScore += item.sentiment.score;
    }
    
    stats.avgRelevance = totalRelevance / this.newsItems.length;
    stats.avgSentimentScore = totalSentimentScore / this.newsItems.length;
    
    // Convert counts to percentages
    const total = this.newsItems.length;
    stats.bySentiment.positivePercent = (stats.bySentiment.positive / total) * 100;
    stats.bySentiment.negativePercent = (stats.bySentiment.negative / total) * 100;
    stats.bySentiment.neutralPercent = (stats.bySentiment.neutral / total) * 100;
    
    return stats;
  }

  /**
   * Export news data for analysis
   */
  async exportData(format = 'json') {
    const data = {
      metadata: {
        exportedAt: Date.now(),
        totalItems: this.newsItems.length,
        sentiment: this.sentiment,
        sentimentScore: this.sentimentScore
      },
      news: this.newsItems.map(item => ({
        id: item.id,
        title: item.title,
        source: item.source,
        publishedAt: item.publishedAt,
        sentiment: item.sentiment,
        relevance: item.relevance,
        url: item.url
      }))
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['ID', 'Title', 'Source', 'Published At', 'Sentiment', 'Score', 'Relevance', 'URL'];
      const rows = data.news.map(item => [
        item.id,
        `"${item.title.replace(/"/g, '""')}"`,
        item.source,
        new Date(item.publishedAt).toISOString(),
        item.sentiment.sentiment,
        item.sentiment.score,
        item.relevance,
        item.url
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
    
    return data;
  }

  /**
   * Clear all news data
   */
  async clearData() {
    const count = this.newsItems.length;
    this.newsItems = [];
    this.sentiment = 'neutral';
    this.sentimentScore = 0;
    
    console.log(`🗑️ Cleared ${count} news items`);
    return { success: true, cleared: count };
  }

  /**
   * Manually add a news item
   */
  async addManualNews(newsItem) {
    const item = {
      id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: newsItem.title,
      description: newsItem.description || '',
      url: newsItem.url || '',
      source: newsItem.source || 'manual',
      publishedAt: newsItem.publishedAt || Date.now(),
      votes: newsItem.votes || { positive: 0, negative: 0, important: 0 },
      currencies: newsItem.currencies || [],
      metadata: newsItem.metadata || {}
    };
    
    // Analyze sentiment and relevance
    item.sentiment = this.analyzeItemSentiment(item);
    item.relevance = this.calculateRelevance(item);
    
    this.newsItems.push(item);
    
    // Update overall sentiment
    await this.analyzeSentiment();
    
    return { success: true, item };
  }
}

module.exports = NewsMonitor;