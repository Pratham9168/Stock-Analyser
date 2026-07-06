// src/database/connection.ts - Database connection management

import { Pool, PoolConfig } from 'pg';
import { DatabaseConfig } from '../types';
import { Logger } from '../utils/logger-enhanced';

const logger = new Logger('Database');

export function createDatabaseConnection(config: DatabaseConfig): Pool {
  let poolConfig: PoolConfig;

  if (config.connectionString) {
    // Use DATABASE_URL connection string (preferred for cloud deployments)
    poolConfig = {
      connectionString: config.connectionString,
      ssl: config.ssl,
      max: config.max,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis
    };
    logger.info('Using DATABASE_URL connection string');
  } else {
    // Use individual connection parameters (local development)
    poolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.max,
      idleTimeoutMillis: config.idleTimeoutMillis,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      statement_timeout: 60000,
    };
    logger.info('Using individual DB connection parameters');
  }

  const pool = new Pool(poolConfig);

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
  });

  // Test connection
  pool.query('SELECT 1')
    .then(() => {
      logger.info('Database connection established successfully');
    })
    .catch((err) => {
      logger.error('Database connection failed:', err);
    });

  return pool;
}

export async function testConnection(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    return false;
  }
}