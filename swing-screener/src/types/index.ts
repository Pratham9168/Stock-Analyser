// src/types/index.ts - Shared type definitions

// Database Types
export interface DatabaseConfig {
  connectionString?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean | { rejectUnauthorized: boolean };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

// Stock Analysis Types
export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AnalysisResult {
  qualified: boolean;
  score: number;
  failedAt: number;
  reason: string;
  currentPrice?: number;
  ema10?: number;
  ema20?: number;
  details: Record<string, any>;
  analysisDurationMs: number;
  dataPointsDaily: number;
  dataPointsIntraday: number;
}

export interface StockData {
  symbol: string;
  name: string;
  scanType?: string;
}

export interface ScanResult {
  qualifiedCount: number;
  totalCandidates: number;
  successRate: number;
  duration: number;
}

// Portfolio Types
export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  targetPrice: number;
  status: 'active' | 'closed' | 'partial';
  createdAt: string;
  updatedAt: string;
}

export interface PositionData {
  symbol: string;
  name: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  targetPrice: number;
}

// Notification Types
export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface Stock {
  Symbol: string;
  Name: string;
  'Buy Price': number;
  Stoploss?: number;
  'Target 1'?: number;
  'Target 2'?: number;
  'Target 3'?: number;
  'Entry Triggered'?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Configuration Types
export interface AppConfig {
  env: string;
  logLevel: string;
  database: DatabaseConfig;
  email: EmailConfig;
  scheduler: {
    enabled: boolean;
    timezone: string;
    scanCron: string;
  };
  dashboard: {
    port: number;
    enabled: boolean;
  };
  notifications: {
    sendEmail: boolean;
    sendTelegram: boolean;
  };
  ai: {
    enabled: boolean;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    rateLimitMs: number;
    confidenceThreshold: number;
    groqApiKey: string;
    groqModel: string;
    openRouterApiKey: string;
    openRouterModel: string;
  };
}

// Service Types
export interface ScraperResult {
  stocks: StockData[];
  totalCount: number;
  duration: number;
}

export interface LoggerConfig {
  level: string;
  format: string;
  transports: any[];
}

// Error Types
export interface AppError extends Error {
  code: string;
  statusCode: number;
  isOperational: boolean;
}

// Job Types
export interface JobConfig {
  name: string;
  schedule: string;
  enabled: boolean;
  timeout: number;
}

export interface JobResult {
  success: boolean;
  duration: number;
  processed: number;
  errors: string[];
}

// Export all types as a namespace for easier imports
export * from './database';
export * from './api';
export * from './analysis';
