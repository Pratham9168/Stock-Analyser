import { Pool } from 'pg';

async function checkRealDb() {
  const host = '127.0.0.1'; // Use IPv4 address instead of 'localhost'
  console.log(`Connecting to ${host}...`);

  const configs = [
    { user: 'mcp_full_access_user', password: 'root' },
    { user: 'postgres', password: 'Manju@123' },
    { user: 'kesha', password: 'password' },
    { user: 'kesha', password: '' }
  ];

  for (const config of configs) {
    try {
      const pool = new Pool({
        host,
        port: 5432,
        database: 'stock_analysis',
        user: config.user,
        password: config.password,
      });
      const res = await pool.query("SELECT COUNT(*) as count FROM ea_daily_stocks");
      console.log(`SUCCESS with user: ${config.user}! Rows: ${res.rows[0].count}`);
      await pool.end();
      return;
    } catch (err: any) {
      console.log(`Failed user: ${config.user}: ${err.message?.split('\n')[0]}`);
    }
  }
}

checkRealDb().catch(console.error);
