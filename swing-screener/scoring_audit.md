# Scoring Audit: Current Implementation vs N.E.X.T Platform

## ROOT CAUSE ANALYSIS

### Issue 1: Scan History Sector = "Others" (CRITICAL BUG)
**Current**: All scan results since June 3 have sector = "Others".
**N.E.X.T**: Scan results carry correct sectors (Financial Services, Engineering etc.)

**Why**: The `universeSector` lookup is done via `universeSymbolMap.get(sym)`. 
But most stocks (1813 of 2357) in `ea_stock_universe` are classified as sector="Others" 
because the NSE classification API returned 403 and only ~544 stocks have real sectors.

**Effect**: The OS() scoring algorithm finds zero appearances for sectors like 
"Financial Services", "Engineering" etc. => ALL show as "Dull" with final_score based
only on quality metrics, not momentum/scan data.

---

### Issue 2: Sector Score = All "Dull" (CRITICAL BUG - caused by Issue 1)
**Current**: Only "Others" sector shows any scan data. All real sectors show Dull.
**N.E.X.T**: All sectors have varying momentum based on scan appearances.

**Why**: The `k` (unique_stocks from scan) is 0 for all real sectors => `k <= dullThreshold` => isDull = true.

---

### Issue 3: Market Mood formula drift (MEDIUM BUG)
**Current formula**:
  base = (ema20_pct * 0.15) + (ema50_pct * 0.15) + (ema200_pct * 0.10) + 15
  + 15 if n500 > ema10
  + 15 if ema10 > ema20
  + sectorsAccel * 2 — sectorsFading * 2
  + avgScore * 0.2   ← NON-STANDARD, added manually

**N.E.X.T formula (original)**:
  base = (ema20_pct * 0.15) + (ema50_pct * 0.15) + (ema200_pct * 0.10) + 15
  + 15 if n500 > ema10
  + 15 if ema10 > ema20
  (NO sector momentum bonus — that was added by us)

The avgScore * 0.2 is non-standard and inflates the score.

---

### Issue 4: EMA200 breadth always 0 (MEDIUM BUG)
**Current**: above_ema200_pct = 0 always in market mood
**Why**: ea_daily_stocks.above_ema_200 is NULL for all recent dates because
EMA-200 requires 200 bars of history. The data backfill only fetches ~253 bars
but many stocks were fetched incrementally without enough history.

---

### Issue 5: RS Rating coverage too low (MEDIUM BUG)
**Current**: Only 81 stocks have RS ratings for today (June 15). 
**N.E.X.T**: Every stock in the universe should have an RS rating.
**Why**: The RS calculation requires 63+ bars per stock. If the DB history 
is incomplete for many stocks, they get skipped.

---

## FIXES REQUIRED

### Fix 1: Re-classify all stocks sector mapping from DB + CSV (DONE partially)
The enrichUniverseFromNseCSV already runs but stocks not in the 4 index CSVs
remain as "Others". Need to use the ea_stock_universe data that IS correctly 
mapped to propagate to scan_history retroactively.

### Fix 2: Retroactively update ea_scan_history sectors
All recent scan_history rows with sector='Others' need to be updated to
the correct sector from ea_stock_universe.

### Fix 3: Revert computeMarketMood to N.E.X.T original formula
Remove the avgScore * 0.2 bonus that was added.

### Fix 4: Recalculate all scores with correct data
