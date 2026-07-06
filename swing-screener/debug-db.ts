import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stock_analysis',
  user: process.env.DB_USER || 'kesha',
  password: process.env.DB_PASSWORD || '',
});

async function debug() {
  try {
    // 1. List tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables in public schema:");
    console.table(tables.rows.map(r => r.table_name));

    // 2. Query count for each ea_ table
    for (const row of tables.rows) {
      const tableName = row.table_name;
      if (tableName.startsWith('ea_')) {
        try {
          const countRes = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          console.log(`${tableName} count: ${countRes.rows[0].count}`);
        } catch (e: any) {
          console.log(`${tableName} query failed: ${e.message}`);
        }
      }
    }

    // 3. Print a few rows from ea_pipeline_runs
    const runs = await pool.query(`SELECT * FROM ea_pipeline_runs ORDER BY id DESC LIMIT 5`);
    console.log("\nPipeline Runs:");
    console.table(runs.rows);

  } catch (err: any) {
    console.error("Debug failed:", err.message);
  } finally {
    await pool.end();
  }
}

debug().catch(console.error);
