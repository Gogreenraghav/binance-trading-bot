/**
 * Logger Utility
 * Provides consistent logging across the application
 */

class Logger {
  constructor(module) {
    this.module = module;
  }

  info(message, ...args) {
    console.log(`[INFO] [${this.module}] ${message}`, ...args);
  }

  error(message, ...args) {
    console.error(`[ERROR] [${this.module}] ${message}`, ...args);
  }

  warn(message, ...args) {
    console.warn(`[WARN] [${this.module}] ${message}`, ...args);
  }

  debug(message, ...args) {
    console.debug(`[DEBUG] [${this.module}] ${message}`, ...args);
  }
}

module.exports = Logger;