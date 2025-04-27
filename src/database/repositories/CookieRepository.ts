import db from '../Database.js';
import { Logger } from '../../utils/Logger.js';

// Re-define or import the Cookie interface (make sure it matches Aternos.ts)
interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  session: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

// Define interface for the DB row
interface CookieRow {
  cookies_json: string;
}

class CookieRepository {
  private db;

  constructor() {
    this.db = db.getConnection();
  }

  /**
   * Retrieves Aternos cookies from the database.
   * @returns {Cookie[] | null} The array of cookies or null if not found/error.
   */
  getCookies(): Cookie[] | null {
    try {
      const stmt = this.db.prepare('SELECT cookies_json FROM aternos_cookies WHERE id = 1');
      // Explicitly type the result of get()
      const row = stmt.get() as CookieRow | undefined;

      if (row && typeof row.cookies_json === 'string') {
        const cookies = JSON.parse(row.cookies_json) as Cookie[];
        Logger.info('CookieRepo', `Retrieved ${cookies.length} cookies from DB.`);
        return cookies;
      }
      Logger.info('CookieRepo', 'No cookies found in DB.');
      return null;
    } catch (error) {
      Logger.error('CookieRepo', 'Error retrieving cookies from DB:', error);
      return null;
    }
  }

  /**
   * Saves or updates Aternos cookies in the database.
   * @param {Cookie[]} cookies - The array of cookies to save.
   */
  saveCookies(cookies: Cookie[]): void {
    if (!cookies || cookies.length === 0) {
      Logger.warn('CookieRepo', 'Attempted to save empty or null cookies.');
      return;
    }
    try {
      const cookiesJson = JSON.stringify(cookies);
      // Use INSERT OR REPLACE (UPSERT) to handle both inserting the first time and updating later
      const stmt = this.db.prepare(`
        INSERT INTO aternos_cookies (id, cookies_json)
        VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET
          cookies_json = excluded.cookies_json,
          updated_at = CURRENT_TIMESTAMP
      `);
      const info = stmt.run(cookiesJson);
      Logger.info(
        'CookieRepo',
        `Saved ${cookies.length} cookies to DB. Rows affected: ${info.changes}`,
      );
    } catch (error) {
      Logger.error('CookieRepo', 'Error saving cookies to DB:', error);
    }
  }

  /**
   * Clears Aternos cookies from the database.
   */
  clearCookies(): void {
    try {
      const stmt = this.db.prepare('DELETE FROM aternos_cookies WHERE id = 1');
      const info = stmt.run();
      Logger.info('CookieRepo', `Cleared cookies from DB. Rows affected: ${info.changes}`);
    } catch (error) {
      Logger.error('CookieRepo', 'Error clearing cookies from DB:', error);
    }
  }
}

// Export a singleton instance
const cookieRepository = new CookieRepository();
export default cookieRepository;
