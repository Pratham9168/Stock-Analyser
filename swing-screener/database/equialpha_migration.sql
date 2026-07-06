BEGIN;

-- ═══════════════════════════════════════════
-- GROUP 1: STOCK UNIVERSE & CLASSIFICATION
-- ═══════════════════════════════════════════

-- Master stock list (~1,985 NSE stocks)
CREATE TABLE IF NOT EXISTS ea_stock_universe (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    sector      VARCHAR(100),          -- Parent sector (32 total, e.g. "Industrials")
    industry    VARCHAR(100),          -- Industry (70+, e.g. "Electrical Equipment")
    exchange    VARCHAR(10) DEFAULT 'NSE',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Daily per-stock snapshot (EOD data)
CREATE TABLE IF NOT EXISTS ea_daily_stocks (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    date            DATE NOT NULL,
    close           DECIMAL(12,2),
    pct_change      DECIMAL(8,4),
    high_52w        DECIMAL(12,2),
    low_52w         DECIMAL(12,2),
    from_52w_high   DECIMAL(8,4),
    new_52w_high    BOOLEAN DEFAULT FALSE,
    new_52w_low     BOOLEAN DEFAULT FALSE,
    ema_10          DECIMAL(12,2),
    ema_20          DECIMAL(12,2),
    ema_50          DECIMAL(12,2),
    ema_200         DECIMAL(12,2),
    above_ema_10    BOOLEAN,
    above_ema_20    BOOLEAN,
    above_ema_50    BOOLEAN,
    above_ema_200   BOOLEAN,
    volume          BIGINT,
    UNIQUE(symbol, date)
);

-- Daily RS ratings per stock (1-99 percentile)
CREATE TABLE IF NOT EXISTS ea_rs_history (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) NOT NULL,
    date        DATE NOT NULL,
    rs_rating   INTEGER NOT NULL CHECK (rs_rating BETWEEN 1 AND 99),
    rs_delta    INTEGER,              -- change from previous day
    UNIQUE(symbol, date)
);

-- ═══════════════════════════════════════════
-- GROUP 2: SCAN DATA
-- ═══════════════════════════════════════════

-- Chartink scan results (daily breakout candidates)
CREATE TABLE IF NOT EXISTS ea_scan_history (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) NOT NULL,
    date        DATE NOT NULL,
    sector      VARCHAR(100),
    industry    VARCHAR(100),
    scan_type   VARCHAR(50) DEFAULT 'equialpha',  -- 'equialpha' | 'shakeout' | 'bear-squeeze'
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(symbol, date, scan_type)
);

-- Stocks from scans not in universe
CREATE TABLE IF NOT EXISTS ea_unmapped_stocks (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) NOT NULL UNIQUE,
    first_seen  DATE NOT NULL,
    scan_count  INTEGER DEFAULT 1,
    is_mapped   BOOLEAN DEFAULT FALSE,
    sector      VARCHAR(100),
    industry    VARCHAR(100),
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Manual sector/industry corrections
CREATE TABLE IF NOT EXISTS ea_stock_overrides (
    symbol              VARCHAR(20) PRIMARY KEY,
    sector_override     VARCHAR(100),
    industry_override   VARCHAR(100),
    updated_at          TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- GROUP 3: COMPUTED SCORES (pipeline output)
-- ═══════════════════════════════════════════

-- Sector/industry performance averages (32 sectors + ~70 industries)
CREATE TABLE IF NOT EXISTS ea_sector_performance (
    id          SERIAL PRIMARY KEY,
    date        DATE NOT NULL,
    sector      VARCHAR(100) NOT NULL,
    sector_type VARCHAR(20) DEFAULT 'industry',  -- 'sector' or 'industry'
    stocks_count INTEGER,
    today_pct   DECIMAL(8,4),
    week1_pct   DECIMAL(8,4),
    month1_pct  DECIMAL(8,4),
    month3_pct  DECIMAL(8,4),
    UNIQUE(date, sector, sector_type)
);

-- Sector/industry scores + momentum labels
CREATE TABLE IF NOT EXISTS ea_sector_scores (
    id                  SERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    sector              VARCHAR(100) NOT NULL,
    sector_type         VARCHAR(20) DEFAULT 'industry',
    final_score         INTEGER,          -- 0-100
    avg_rs              INTEGER,
    rs80_pct            INTEGER,
    near52w_pct         INTEGER,
    momentum            VARCHAR(20),      -- Accelerating/Steady/Fading/Dull
    prev_momentum       VARCHAR(20),
    appearances         INTEGER,
    unique_stocks       INTEGER,
    last7_appearances   INTEGER,
    quality_score       INTEGER,
    scan_score          INTEGER,
    accel_score         INTEGER,
    recency_score       INTEGER,
    today_pct           DECIMAL(8,4),
    verdict             VARCHAR(20),
    UNIQUE(date, sector, sector_type)
);

-- Market mood daily snapshot
CREATE TABLE IF NOT EXISTS ea_market_mood (
    id                      SERIAL PRIMARY KEY,
    date                    DATE NOT NULL UNIQUE,
    nifty500_close          DECIMAL(12,2),
    nifty500_ema10          DECIMAL(12,2),
    nifty500_ema20          DECIMAL(12,2),
    nifty50_close           DECIMAL(12,2),
    nifty50_change_pct      DECIMAL(8,4),
    nifty500_change_pct     DECIMAL(8,4),
    above_ema20_pct         DECIMAL(6,2),
    above_ema50_pct         DECIMAL(6,2),
    above_ema200_pct        DECIMAL(6,2),
    sectors_accelerating    INTEGER,
    sectors_fading          INTEGER,
    avg_sector_score        DECIMAL(6,2),
    mood_score              INTEGER CHECK (mood_score BETWEEN 0 AND 100),
    mood_label              VARCHAR(30),
    ad_ratio                DECIMAL(6,2),
    advancing               INTEGER,
    declining               INTEGER
);

-- Daily market breadth history
CREATE TABLE IF NOT EXISTS ea_breadth_history (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL UNIQUE,
    above_ema20_pct DECIMAL(6,2),
    above_ema50_pct DECIMAL(6,2),
    above_ema200_pct DECIMAL(6,2),
    advancing       INTEGER,
    declining       INTEGER,
    total           INTEGER
);

-- ═══════════════════════════════════════════
-- GROUP 4: RESEARCH (admin features)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ea_research_log (
    id          SERIAL PRIMARY KEY,
    date        DATE NOT NULL,
    comment     TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ea_research_watchlist (
    id          SERIAL PRIMARY KEY,
    date        DATE NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    sector      VARCHAR(100),
    industry    VARCHAR(100),
    note        TEXT,
    added_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ea_setups (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(20) NOT NULL,
    date        DATE NOT NULL,
    month       VARCHAR(50),
    logic       TEXT,
    chart_url   TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- GROUP 5: PIPELINE MANAGEMENT
-- ═══════════════════════════════════════════

-- Track pipeline execution status (for progress bar UI)
CREATE TABLE IF NOT EXISTS ea_pipeline_runs (
    id              SERIAL PRIMARY KEY,
    started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    status          VARCHAR(20) DEFAULT 'running',  -- running/completed/failed
    current_step    VARCHAR(100),
    progress_pct    INTEGER DEFAULT 0,
    stocks_processed INTEGER DEFAULT 0,
    total_stocks    INTEGER DEFAULT 0,
    error_message   TEXT,
    duration_seconds INTEGER,
    CONSTRAINT chk_pipeline_status CHECK (status IN ('running', 'completed', 'failed', 'paused'))
);

-- ═══════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ea_ds_symbol_date ON ea_daily_stocks(symbol, date);
CREATE INDEX IF NOT EXISTS idx_ea_ds_date ON ea_daily_stocks(date);
CREATE INDEX IF NOT EXISTS idx_ea_ds_sector ON ea_daily_stocks(symbol);  -- for joins with ea_stock_universe
CREATE INDEX IF NOT EXISTS idx_ea_rs_symbol_date ON ea_rs_history(symbol, date);
CREATE INDEX IF NOT EXISTS idx_ea_rs_date ON ea_rs_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_scan_date ON ea_scan_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_scan_symbol ON ea_scan_history(symbol);
CREATE INDEX IF NOT EXISTS idx_ea_scan_type ON ea_scan_history(scan_type);
CREATE INDEX IF NOT EXISTS idx_ea_ss_date ON ea_sector_scores(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_ss_type ON ea_sector_scores(sector_type);
CREATE INDEX IF NOT EXISTS idx_ea_sp_date ON ea_sector_performance(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_mood_date ON ea_market_mood(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_breadth_date ON ea_breadth_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_rlog_date ON ea_research_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_rwl_date ON ea_research_watchlist(date DESC);
CREATE INDEX IF NOT EXISTS idx_ea_pipeline_status ON ea_pipeline_runs(status, started_at DESC);

-- ═══════════════════════════════════════════
-- GROUP 6: TRADE JOURNAL
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ea_trade_journal (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(20) NOT NULL,
    entry_date      DATE NOT NULL,
    entry_price     DECIMAL(12,2) NOT NULL,
    quantity        INTEGER NOT NULL,
    stop_loss       DECIMAL(12,2),
    status          VARCHAR(10) DEFAULT 'open',  -- 'open' or 'closed'
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ea_trade_additions (
    id              SERIAL PRIMARY KEY,
    trade_id        INTEGER REFERENCES ea_trade_journal(id),
    date            DATE NOT NULL,
    price           DECIMAL(12,2) NOT NULL,
    quantity        INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ea_trade_exits (
    id              SERIAL PRIMARY KEY,
    trade_id        INTEGER REFERENCES ea_trade_journal(id),
    date            DATE NOT NULL,
    price           DECIMAL(12,2) NOT NULL,
    quantity        INTEGER NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ea_user_capital (
    id              SERIAL PRIMARY KEY,
    amount          DECIMAL(14,2) NOT NULL,
    updated_at      TIMESTAMP DEFAULT NOW()
);

COMMIT;
