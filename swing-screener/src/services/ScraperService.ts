// src/services/ScraperService.ts - Web scraping service

import { BaseService } from './BaseService';
import { ScraperResult, StockData } from '../types';
import * as puppeteer from 'puppeteer';

export class ScraperService extends BaseService {
  private readonly SCREENER_URLS: string[] = [
    'https://chartink.com/screener/shakeout-reversal',
    'https://chartink.com/screener/copy-r2-bear-squeeze-setup-bss-13',
  ];

  constructor() {
    super('ScraperService');
  }

  // Called by ScanService
  async scrapeFromMultipleUrls(): Promise<ScraperResult> {
    return this.scrapeAllStocks();
  }

  async scrapeAllStocks(): Promise<ScraperResult> {
    const startTime = Date.now();
    let browser: puppeteer.Browser | null = null;

    try {
      this.logger.info(`🚀 Starting stock scraping process for ${this.SCREENER_URLS.length} Chartink screeners`);
      
      browser = await this.launchBrowser();
      const allStocks: StockData[] = [];
      const seenSymbols = new Set<string>();

      for (const url of this.SCREENER_URLS) {
        try {
          const page = await browser.newPage();
          await this.setupPage(page);
          
          this.logger.info(`🌐 Navigating to Chartink screener: ${url}`);
          await this.navigateToUrl(page, url);
          
          // Wait for table to load
          await this.delay(5000);
          
          // Check if page loaded correctly
          const pageTitle = await page.title();
          const pageUrl = page.url();
          this.logger.info(`📄 Page loaded - Title: "${pageTitle}", URL: ${pageUrl}`);
          
          const totalStocks = await this.getTotalStockCount(page);
          this.logger.info(`📈 Total stocks detected for ${url.split('/').pop()}: ${totalStocks}`);

          if (totalStocks > 0) {
            const scanType = url.split('/').pop() || 'equialpha';
            const stocks = await this.extractAllStocks(page, totalStocks, seenSymbols, scanType);
            allStocks.push(...stocks);
            this.logger.success(`✅ Found ${stocks.length} unique stocks from this screener`);
            
            if (stocks.length === 0 && totalStocks > 0) {
              this.logger.warn(`⚠️ Detected ${totalStocks} stocks but extracted 0. This may indicate a table structure mismatch.`);
            }
          } else {
            this.logger.warn(`⚠️ No stocks found. This could mean:
              - The screener has no results for the selected date
              - The page structure has changed
              - The page failed to load properly`);
            
            const tableExists = await page.evaluate(() => {
              const table = document.querySelector('table');
              return table !== null;
            });
            
            if (!tableExists) {
              this.logger.error(`❌ No table element found on page. Page structure may be different.`);
            } else {
              this.logger.info(`✅ Table element exists but appears to be empty.`);
            }
          }
          
          await page.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`❌ Error scraping from Chartink (${url}): ${errorMessage}`);
          // Continue to the next URL even if one fails
        }
      }
      
      this.logger.success(`\n🎉 Scraping completed! Total unique stocks: ${allStocks.length}`);
      this.logger.info(`📊 Breakdown: ${allStocks.length} unique stocks after deduplication`);
      
      return {
        stocks: allStocks,
        totalCount: allStocks.length,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.handleError(error, 'Stock scraping failed');
      return {
        stocks: [],
        totalCount: 0,
        duration: Date.now() - startTime
      };
    } finally {
      if (browser) {
        try {
          const closePromise = browser.close();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 5000));
          await Promise.race([closePromise, timeoutPromise]);
          this.logger.info('Browser closed gracefully');
        } catch (e) {
          this.logger.warn('Browser close timed out or failed, forcing process kill');
          if (browser.process()) {
             browser.process()?.kill('SIGKILL');
          }
        }
      }
    }
  }

  private async launchBrowser(): Promise<puppeteer.Browser> {
    return await puppeteer.launch({
      headless: 'new',
      protocolTimeout: 300000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled'
      ]
    });
  }

  private async setupPage(page: puppeteer.Page): Promise<void> {
    // Set viewport to a common desktop resolution
    await page.setViewport({ width: 1366, height: 768 });
    // Use a realistic user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  private async navigateToUrl(page: puppeteer.Page, url: string): Promise<void> {
    this.logger.info(`🌐 Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle0', 
      timeout: 120000 
    });

    // Wait for page to fully load
    await this.delay(10000);
    
    this.logger.info('✅ Page loaded');
  }

  private async getTotalStockCount(page: puppeteer.Page): Promise<number> {
    return await page.evaluate(() => {
      // Look for text that contains "X stocks" or "X total"
      const allText = document.body.textContent || '';
      
      // Try to find patterns like "50 stocks" or "50 total"
      const patterns = [
        /(\d+)\s+stocks/i,
        /(\d+)\s+total/i,
        /showing.*?(\d+)/i,
        /of\s+(\d+)/i
      ];
      
      for (const pattern of patterns) {
        const match = allText.match(pattern);
        if (match) {
          const count = parseInt(match[1]);
          if (count > 0) {
            return count;
          }
        }
      }
      
      // If no pattern found, count the rows directly
      const rows = document.querySelectorAll('table tbody tr');
      return rows.length;
    });
  }

  private async extractAllStocks(page: puppeteer.Page, totalStocks: number, globalSeenSymbols: Set<string>, scanType: string): Promise<StockData[]> {
    const allStocks: StockData[] = [];
    const localSeenSymbols = new Set<string>(); // For deduplication within this source
    let currentPage = 1;
    let maxPages = Math.ceil(totalStocks / 20);
    
    // If we couldn't determine total count (0), set a reasonable limit
    // If totalStocks is known but < 20, we likely only have 1 page
    if (totalStocks === 0) {
      maxPages = 10; // Process up to 10 pages when count is unknown
      this.logger.info('Total count unknown, will process up to 10 pages');
    } else {
      // Calculate actual pages needed, but cap at 10 for safety
      maxPages = Math.max(1, Math.min(maxPages, 10));
      this.logger.info(`Will process up to ${maxPages} pages (${totalStocks} stocks total)`);
    }

    let previousPageStockCount = 0;
    let consecutiveDuplicatePages = 0;

    while (currentPage <= maxPages) {
      this.logger.info(`📄 Processing page ${currentPage}/${maxPages}...`);

      const pageStocks = await this.extractPageStocks(page);
      
      // If no stocks found on this page, we've reached the end
      if (pageStocks.length === 0) {
        this.logger.info('No stocks found on this page, stopping pagination');
        break;
      }
      
      // Check if we're getting the same stocks as previous page (pagination not working)
      if (currentPage > 1 && pageStocks.length === previousPageStockCount) {
        const allSameStocks = pageStocks.every((stock: StockData) => localSeenSymbols.has(stock.symbol));
        if (allSameStocks) {
          consecutiveDuplicatePages++;
          this.logger.warn(`⚠️ Page ${currentPage}: Found same ${pageStocks.length} stocks as previous page (possible pagination issue)`);
          
          // If we get duplicate pages twice in a row, stop pagination
          if (consecutiveDuplicatePages >= 2) {
            this.logger.warn('🛑 Stopping pagination: Multiple consecutive pages with identical stocks detected');
            break;
          }
        } else {
          consecutiveDuplicatePages = 0; // Reset counter if we got new stocks
        }
      } else {
        consecutiveDuplicatePages = 0; // Reset counter on first page or when count changes
      }
      
      previousPageStockCount = pageStocks.length;
      
      // Add unique stocks (check both local and global deduplication)
      let newStocksCount = 0;
      pageStocks.forEach((stock: StockData) => {
        // Skip if already seen globally (from other sources) or locally (within this source)
        if (!globalSeenSymbols.has(stock.symbol) && !localSeenSymbols.has(stock.symbol)) {
          localSeenSymbols.add(stock.symbol);
          globalSeenSymbols.add(stock.symbol); // Mark as seen globally
          stock.scanType = scanType;
          allStocks.push(stock);
          newStocksCount++;
        }
      });

      this.logger.info(`📊 Page ${currentPage}: Found ${pageStocks.length} stocks, ${newStocksCount} new unique, Total unique from this source: ${allStocks.length}`);

      // If no new stocks found and we've processed at least one page, we're done
      if (currentPage > 1 && newStocksCount === 0) {
        this.logger.info('No new stocks found on this page, stopping pagination');
        break;
      }

      // Navigate to next page if not the last page
      if (currentPage < maxPages) {
        const hasNextPage = await this.navigateToNextPage(page);
        if (!hasNextPage) {
          this.logger.info('No next page available, stopping pagination');
          break;
        }
      }

      currentPage++;
    }

    return allStocks;
  }

  private async extractPageStocks(page: puppeteer.Page): Promise<StockData[]> {
    return await page.evaluate(() => {
      const stocks: StockData[] = [];
      const rows = document.querySelectorAll('table tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          // Based on the table structure:
          // Column 0: Row number
          // Column 1: Company name  
          // Column 2: Stock symbol
          const name = cells[1]?.textContent?.trim() || '';
          const symbol = cells[2]?.textContent?.trim() || '';
          
          if (symbol && name) {
            stocks.push({ symbol, name });
          }
        }
      });
      
      return stocks;
    });
  }

  private async navigateToNextPage(page: puppeteer.Page): Promise<boolean> {
    try {
      // Capture current URL and first stock symbol for comparison
      const beforeNavigation = await page.evaluate(() => {
        const firstRow = document.querySelector('table tbody tr');
        const firstSymbol = firstRow?.querySelectorAll('td')[2]?.textContent?.trim() || '';
        return {
          url: window.location.href,
          firstSymbol: firstSymbol
        };
      });

      // Use page.evaluate to find and click the next button
      const buttonInfo = await page.evaluate(() => {
        // Look for buttons or links containing "Next"
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const nextButton = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          const title = btn.getAttribute('title')?.toLowerCase() || '';
          return text.includes('next') || ariaLabel.includes('next') || title.includes('next');
        });
        
        if (nextButton) {
          const isDisabled = nextButton.classList.contains('disabled') || 
                           nextButton.hasAttribute('disabled') ||
                           nextButton.getAttribute('aria-disabled') === 'true';
          return {
            found: true,
            disabled: isDisabled,
            tagName: nextButton.tagName,
            classes: Array.from(nextButton.classList).join(' ')
          };
        }
        
        // Also check for pagination elements (page numbers, arrows, etc.)
        const paginationInfo = {
          paginationElements: document.querySelectorAll('[class*="pagination"], [class*="page"]').length,
          arrows: document.querySelectorAll('[class*="arrow"], [class*="chevron"]').length
        };
        
        return {
          found: false,
          disabled: false,
          paginationInfo: paginationInfo
        };
      });

      if (!buttonInfo.found) {
        this.logger.warn('Next button not found', {
          paginationElements: buttonInfo.paginationInfo?.paginationElements || 0,
          arrows: buttonInfo.paginationInfo?.arrows || 0
        });
        return false;
      }

      if (buttonInfo.disabled) {
        this.logger.info('Next button is disabled - no more pages available');
        return false;
      }

      // Click the next button
      const clickSuccess = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const nextButton = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
          const title = btn.getAttribute('title')?.toLowerCase() || '';
          return text.includes('next') || ariaLabel.includes('next') || title.includes('next');
        });
        
        if (nextButton && !nextButton.classList.contains('disabled')) {
          (nextButton as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!clickSuccess) {
        this.logger.warn('Failed to click next button');
        return false;
      }

      // Wait for navigation/update
      await this.delay(3000);
      
      try {
        await page.waitForNetworkIdle({ timeout: 10000 });
      } catch (e) {
        this.logger.debug('Network idle timeout, continuing anyway');
      }

      // Verify that we actually moved to a new page
      const afterNavigation = await page.evaluate(() => {
        const firstRow = document.querySelector('table tbody tr');
        const firstSymbol = firstRow?.querySelectorAll('td')[2]?.textContent?.trim() || '';
        return {
          url: window.location.href,
          firstSymbol: firstSymbol
        };
      });

      // Check if page actually changed
      if (beforeNavigation.firstSymbol && afterNavigation.firstSymbol === beforeNavigation.firstSymbol) {
        this.logger.warn('⚠️ Pagination click succeeded but page content unchanged', {
          before: beforeNavigation.firstSymbol,
          after: afterNavigation.firstSymbol,
          urlChanged: beforeNavigation.url !== afterNavigation.url
        });
        // Still return true to let the duplicate detection handle it
      } else {
        this.logger.debug('✅ Successfully navigated to next page', {
          urlChanged: beforeNavigation.url !== afterNavigation.url
        });
      }

      return true;
    } catch (error) {
      this.logger.error('Error navigating to next page:', (error as Error).message);
      return false;
    }
  }
}
