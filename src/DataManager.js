const fs = require('fs');
const path = require('path');

/**
 * Handles data persistence and file operations
 */
class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.balancePath = path.join(this.dataDir, 'balances.json');
    this.matchPath = path.join(this.dataDir, 'match.json');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Initialize files if they don't exist
    if (!fs.existsSync(this.balancePath)) {
      fs.writeFileSync(this.balancePath, JSON.stringify({}, null, 2));
    }
    
    if (!fs.existsSync(this.matchPath)) {
      fs.writeFileSync(this.matchPath, JSON.stringify({ status: 'none' }, null, 2));
    }
  }

  /**
   * Load and parse a JSON file
   * @param {string} filePath - Path to the JSON file
   * @returns {Object} Parsed JSON data
   */
  loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  /**
   * Save data to a JSON file
   * @param {string} filePath - Path to save the file
   * @param {Object} data - Data to save
   */
  saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

module.exports = DataManager; 