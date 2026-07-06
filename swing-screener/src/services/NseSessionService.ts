// src/services/NseSessionService.ts — Cookie + Rate Limit manager for NSE India
// Reference: https://github.com/BennyThadikaran/NseIndiaApi

import { BaseService } from './BaseService';

interface NseCookie {
  name: string;
  value: string;
  expires?: number;
}

export class NseSessionService extends BaseService {
  private static readonly BASE_URL = 'https://www.nseindia.com';
  private static readonly API_URL = 'https://www.nseindia.com/api';
  private static readonly ARCHIVE_URL = 'https://nsearchives.nseindia.com';

  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/118.0';

  private static readonly HEADERS: Record<string, string> = {
    'User-Agent': NseSessionService.USER_AGENT,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://www.nseindia.com/get-quotes/equity?symbol=HDFCBANK',
  };

  // Cookie page — NseIndiaApi uses /option-chain to grab cookies
  private static readonly COOKIE_URL = 'https://www.nseindia.com/option-chain';

  // Rate limiting
  private readonly rateLimitMs: number;
  private lastRequestTime = 0;

  // Session cookies
  private cookies: Map<string, string> = new Map();
  private cookiesExpireAt = 0;
  private sessionInitialized = false;
  private initPromise: Promise<void> | null = null;

  // Session init retry config
  private static readonly SESSION_INIT_RETRIES = 3;
  private static readonly SESSION_INIT_BACKOFF_MS = 5000; // 5 seconds base

  // Retry config
  private static readonly MAX_RETRIES = 2;
  private static readonly TIMEOUT_MS = 15000;

  constructor(rateLimitMs?: number) {
    super('NseSessionService');
    // Default: 350ms = ~3 requests per second (matching NSE's tolerance)
    this.rateLimitMs = rateLimitMs ?? parseInt(process.env.NSE_RATE_LIMIT_MS || '350', 10);
  }

  /**
   * Get base API URL
   */
  get apiUrl(): string {
    return NseSessionService.API_URL;
  }

  /**
   * Get archive URL
   */
  get archiveUrl(): string {
    return NseSessionService.ARCHIVE_URL;
  }

  /**
   * Initialize session by visiting the NSE website to get cookies.
   * Safe to call multiple times — will only initialize once.
   */
  async initSession(): Promise<void> {
    if (this.sessionInitialized && !this.hasCookiesExpired()) {
      return;
    }

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitSession();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInitSession(): Promise<void> {
    this.logger.info('Initializing NSE session (fetching cookies)...');

    for (let attempt = 0; attempt < NseSessionService.SESSION_INIT_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NseSessionService.TIMEOUT_MS);

        const response = await fetch(NseSessionService.COOKIE_URL, {
          headers: NseSessionService.HEADERS,
          redirect: 'follow',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`NSE session init failed: ${response.status} ${response.statusText}`);
        }

        // Extract cookies from Set-Cookie headers
        // Use getSetCookie() if available (Node 18.15+), fallback to raw header parsing
        let setCookieHeaders: string[] = [];
        if (typeof response.headers.getSetCookie === 'function') {
          setCookieHeaders = response.headers.getSetCookie();
        } else {
          // Fallback: parse the raw 'set-cookie' header (may be comma-joined)
          const raw = response.headers.get('set-cookie');
          if (raw) {
            // Split on commas that are followed by a cookie name= pattern (not date commas)
            setCookieHeaders = raw.split(/,(?=\s*[A-Za-z0-9_.-]+=)/);
          }
        }

        this.parseCookies(setCookieHeaders);

        if (this.cookies.size === 0) {
          throw new Error('NSE session init returned no cookies');
        }

        // Cookies typically expire in ~5 minutes; refresh slightly earlier
        this.cookiesExpireAt = Date.now() + 4 * 60 * 1000; // 4 minutes
        this.sessionInitialized = true;

        this.logger.info(
          `NSE session initialized (${this.cookies.size} cookies, expires in ~4min)`,
        );
        return; // Success — exit retry loop
      } catch (error: any) {
        const isLastAttempt = attempt === NseSessionService.SESSION_INIT_RETRIES - 1;
        if (isLastAttempt) {
          this.sessionInitialized = false;
          this.logger.error('Failed to initialize NSE session after all retries:', error);
          throw error;
        }

        const backoff = NseSessionService.SESSION_INIT_BACKOFF_MS * (attempt + 1);
        this.logger.warn(
          `NSE session init attempt ${attempt + 1} failed: ${error.message}. Retrying in ${backoff}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  /**
   * Parse Set-Cookie headers into our cookie map
   */
  private parseCookies(setCookieHeaders: string[]): void {
    this.cookies.clear();

    for (const header of setCookieHeaders) {
      const parts = header.split(';')[0]; // Take only name=value
      const eqIdx = parts.indexOf('=');

      if (eqIdx > 0) {
        const name = parts.substring(0, eqIdx).trim();
        const value = parts.substring(eqIdx + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  /**
   * Build cookie header string from stored cookies
   */
  private getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  /**
   * Check if cookies have expired
   */
  private hasCookiesExpired(): boolean {
    return Date.now() >= this.cookiesExpireAt;
  }

  /**
   * Rate limiting — waits until enough time has passed since last request
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Make an authenticated request to NSE
   * Handles: rate limiting, cookie refresh, retries on 403
   */
  async request<T = any>(url: string, params?: Record<string, string>): Promise<T> {
    // Proactive cookie refresh: if cookies expire within 30s, refresh now
    if (this.sessionInitialized && this.cookiesExpireAt - Date.now() < 30_000) {
      this.logger.info('Proactively refreshing NSE cookies (expiring soon)...');
      this.sessionInitialized = false;
    }

    // Ensure session is initialized
    await this.initSession();

    // Build URL with query params
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      fullUrl = `${url}?${searchParams.toString()}`;
    }

    for (let attempt = 0; attempt <= NseSessionService.MAX_RETRIES; attempt++) {
      // Rate limit
      await this.throttle();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          NseSessionService.TIMEOUT_MS,
        );

        const response = await fetch(fullUrl, {
          headers: {
            ...NseSessionService.HEADERS,
            Cookie: this.getCookieHeader(),
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);

        // Cookie expired — refresh and retry with progressive backoff
        if (response.status === 401 || response.status === 403) {
          const backoff = 2000 * (attempt + 1); // 2s, 4s, 6s
          this.logger.warn(
            `NSE returned ${response.status} — refreshing session (attempt ${attempt + 1}/${NseSessionService.MAX_RETRIES + 1}), backing off ${backoff}ms`,
          );
          this.sessionInitialized = false;
          await new Promise(resolve => setTimeout(resolve, backoff));
          await this.initSession();
          continue;
        }

        if (!response.ok) {
          throw new Error(`NSE API error: ${response.status} ${response.statusText} for ${url}`);
        }

        // Check content type — NSE sometimes returns HTML error pages
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          // On HTML response, try refreshing session (NSE often returns a login/block page)
          if (attempt < NseSessionService.MAX_RETRIES) {
            this.logger.warn('NSE returned HTML instead of JSON — refreshing session...');
            this.sessionInitialized = false;
            await new Promise(resolve => setTimeout(resolve, 3000));
            await this.initSession();
            continue;
          }
          throw new Error('NSE returned HTML instead of JSON — data may be unavailable');
        }

        const data = await response.json();
        this.consecutiveFailures = 0; // Success — reset circuit breaker
        return data as T;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(`NSE request timed out: ${url}`);
        }

        // On last attempt, throw
        if (attempt === NseSessionService.MAX_RETRIES) {
          this.consecutiveFailures++;
          throw error;
        }

        const backoff = 1500 * (attempt + 1);
        this.logger.warn(
          `NSE request failed (attempt ${attempt + 1}): ${error.message}. Retrying in ${backoff}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    // Should never reach here, but TypeScript needs it
    this.consecutiveFailures++;
    throw new Error(`NSE request failed after ${NseSessionService.MAX_RETRIES + 1} attempts`);
  }

  /**
   * Make a raw request (for CSV/binary content like FnO lots)
   * Now includes retry + cookie refresh logic (matching request<T>)
   */
  async requestRaw(url: string): Promise<string> {
    // Proactive cookie refresh
    if (this.sessionInitialized && this.cookiesExpireAt - Date.now() < 30_000) {
      this.sessionInitialized = false;
    }

    await this.initSession();

    for (let attempt = 0; attempt <= NseSessionService.MAX_RETRIES; attempt++) {
      await this.throttle();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          NseSessionService.TIMEOUT_MS,
        );

        const response = await fetch(url, {
          headers: {
            ...NseSessionService.HEADERS,
            Cookie: this.getCookieHeader(),
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Cookie expired — refresh and retry
        if (response.status === 401 || response.status === 403) {
          const backoff = 2000 * (attempt + 1);
          this.logger.warn(
            `NSE raw request returned ${response.status} — refreshing session (attempt ${attempt + 1}), backing off ${backoff}ms`,
          );
          this.sessionInitialized = false;
          await new Promise(resolve => setTimeout(resolve, backoff));
          await this.initSession();
          continue;
        }

        if (!response.ok) {
          throw new Error(`NSE raw request failed: ${response.status} for ${url}`);
        }

        // Success — reset circuit breaker
        this.consecutiveFailures = 0;
        return response.text();
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(`NSE raw request timed out: ${url}`);
        }

        if (attempt === NseSessionService.MAX_RETRIES) {
          this.consecutiveFailures++;
          throw error;
        }

        const backoff = 1500 * (attempt + 1);
        this.logger.warn(
          `NSE raw request failed (attempt ${attempt + 1}): ${error.message}. Retrying in ${backoff}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    this.consecutiveFailures++;
    throw new Error(`NSE raw request failed after ${NseSessionService.MAX_RETRIES + 1} attempts`);
  }

  // ── Circuit Breaker ────────────────────────────────────────────
  private consecutiveFailures = 0;
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5;

  /**
   * Check if NSE is available (circuit breaker).
   * After 5 consecutive request failures, consider NSE down.
   * Callers can check this to skip NSE and go straight to Yahoo fallback.
   */
  isAvailable(): boolean {
    return this.consecutiveFailures < NseSessionService.CIRCUIT_BREAKER_THRESHOLD;
  }

  /**
   * Reset the circuit breaker (e.g., after a successful request or manual reset)
   */
  resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Check if the service is healthy (has valid session)
   */
  isHealthy(): boolean {
    return this.sessionInitialized && !this.hasCookiesExpired();
  }

  /**
   * Force a session refresh
   */
  async refreshSession(): Promise<void> {
    this.sessionInitialized = false;
    await this.initSession();
  }
}

/**
 * Custom timeout error
 */
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

