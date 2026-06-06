import fs from 'fs';
import path from 'path';

function writeLog(filename: string, level: 'INFO' | 'WARN' | 'ERROR', message: string, metadata?: any) {
  try {
    const logDir = process.cwd();
    const logFilePath = path.join(logDir, filename);
    const timestamp = new Date().toISOString();
    const metaStr = metadata ? ` | Meta: ${JSON.stringify(metadata)}` : '';
    const logLine = `[${timestamp}] [${level}] ${message}${metaStr}\n`;
    fs.appendFileSync(logFilePath, logLine);
  } catch (err) {
    console.error(`[Logger Error] Failed to write to ${filename}:`, err);
  }
}

export const logger = {
  publish: {
    info: (msg: string, meta?: any) => {
      console.log(`[PUBLISH INFO] ${msg}`, meta || '');
      writeLog('publish.log', 'INFO', msg, meta);
    },
    warn: (msg: string, meta?: any) => {
      console.warn(`[PUBLISH WARN] ${msg}`, meta || '');
      writeLog('publish.log', 'WARN', msg, meta);
    },
    error: (msg: string, meta?: any) => {
      console.error(`[PUBLISH ERROR] ${msg}`, meta || '');
      writeLog('publish.log', 'ERROR', msg, meta);
    },
  },
  scheduler: {
    info: (msg: string, meta?: any) => {
      console.log(`[SCHEDULER INFO] ${msg}`, meta || '');
      writeLog('scheduler.log', 'INFO', msg, meta);
    },
    warn: (msg: string, meta?: any) => {
      console.warn(`[SCHEDULER WARN] ${msg}`, meta || '');
      writeLog('scheduler.log', 'WARN', msg, meta);
    },
    error: (msg: string, meta?: any) => {
      console.error(`[SCHEDULER ERROR] ${msg}`, meta || '');
      writeLog('scheduler.log', 'ERROR', msg, meta);
    },
  },
  analytics: {
    info: (msg: string, meta?: any) => {
      console.log(`[ANALYTICS INFO] ${msg}`, meta || '');
      writeLog('analytics.log', 'INFO', msg, meta);
    },
    warn: (msg: string, meta?: any) => {
      console.warn(`[ANALYTICS WARN] ${msg}`, meta || '');
      writeLog('analytics.log', 'WARN', msg, meta);
    },
    error: (msg: string, meta?: any) => {
      console.error(`[ANALYTICS ERROR] ${msg}`, meta || '');
      writeLog('analytics.log', 'ERROR', msg, meta);
    },
  },
  integrity: {
    info: (msg: string, meta?: any) => {
      console.log(`[INTEGRITY INFO] ${msg}`, meta || '');
      writeLog('integrity_check.log', 'INFO', msg, meta);
    },
    warn: (msg: string, meta?: any) => {
      console.warn(`[INTEGRITY WARN] ${msg}`, meta || '');
      writeLog('integrity_check.log', 'WARN', msg, meta);
    },
    error: (msg: string, meta?: any) => {
      console.error(`[INTEGRITY ERROR] ${msg}`, meta || '');
      writeLog('integrity_check.log', 'ERROR', msg, meta);
    }
  }
};
