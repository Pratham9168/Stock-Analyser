import { EquialphaPipelineService } from './src/services/equialpha/EquialphaPipelineService';
import { EquialphaRepository } from './src/repositories/EquialphaRepository';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function test() {
  const repo = new EquialphaRepository(pool);
  const today = '2026-05-06';
  const res = await pool.query('SELECT symbol, close FROM ea_daily_stocks WHERE date = $1 LIMIT 5', [today]);
  
  for (const row of res.rows) {
      const closesRes = await repo.getClosesForEma(row.symbol, 253);
      console.log(`${row.symbol}: ${closesRes.length} closes in DB`);
  }
  pool.end();
}

test().catch(console.error);
