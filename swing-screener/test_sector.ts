import { Pool } from 'pg';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';

async function test() {
  const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'equialpha',
    password: process.env.PGPASSWORD || 'postgres',
    port: parseInt(process.env.PGPORT || '5432'),
  });
  const repo = new EquialphaRepository(pool);
  const latestDate = await repo.getLatestDate();
  console.log("Latest date:", latestDate);
  const stocks = await repo.getSectorDetails('IT', latestDate || '');
  console.log("Returned stocks:", stocks.length);
  if (stocks.length > 0) console.log("First stock:", stocks[0].symbol, stocks[0].sector, stocks[0].industry);
  
  // also check if any stock has sector IT
  const allIT = await pool.query("SELECT COUNT(*) FROM ea_stock_universe WHERE sector = 'IT' OR industry = 'IT'");
  console.log("Total IT stocks in universe:", allIT.rows[0].count);
  process.exit(0);
}
test();
