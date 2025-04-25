import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Handles data persistence and file operations
 */
export class DataManager {
  private dataDir: string;
  private balancePath: string;
  private matchPath: string;
  
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
   * @returns {any} Parsed JSON data
   */
  loadJson(filePath: string): any {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  /**
   * Save data to a JSON file
   * @param {string} filePath - Path to save the file
   * @param {any} data - Data to save
   */
  saveJson(filePath: string, data: any): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
} 