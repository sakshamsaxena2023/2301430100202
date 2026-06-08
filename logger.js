import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.AFFORDMED_BASE_URL || 'http://4.224.186.213/evaluation-service';
const AUTH_TOKEN = process.env.AFFORDMED_AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhMjAyM2NzZTk0NDFAaW1zZWMuYWMuaW4iLCJleHAiOjE3ODA5MDI5MDUsImlhdCI6MTc4MDkwMjAwNSwiaXNzIjoiQWZmb3JkIE1lZGljYWwgVGVjaG5vbG9naWVzIFByaXZhdGUgTGltaXRlZCIsImp0aSI6ImJlZTVjYjE2LWIwMjEtNDVjMi1iYWUxLTI4YmJkYmI2NTZmNyIsImxvY2FsZSI6ImVuLUlOIiwibmFtZSI6InNha3NoYW0gc2F4ZW5hIiwic3ViIjoiMzY1Y2NmZGEtMGRhZi00MjUyLWFhZmEtZWVkYzQzMmJjNmE3In0sImVtYWlsIjoiYTIwMjNjc2U5NDQxQGltc2VjLmFjLmluIiwibmFtZSI6InNha3NoYW0gc2F4ZW5hIiwicm9sbE5vIjoiMjMwMTQzMDEwMDIwMiIsImFjY2Vzc0NvZGUiOiJueVhRTXUiLCJjbGllbnRJRCI6IjM2NWNjZmRhLTBkYWYtNDI1Mi1hYWZhLWVlZGM0MzJiYzZhNyIsImNsaWVudFNlY3JldCI6Ik1ocGtxdE1OQkpneGp6U3oifQ.AKYnwk3oSxdkB5vJ20Yhpzd9jWEpMgk4OlXFuImMYa4';

const ALLOWED_STACKS = new Set(['backend', 'frontend']);
const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const ALLOWED_BACKEND_PACKAGES = new Set([
  'cache',
  'controller',
  'cron_job',
  'db',
  'domain',
  'handler',
  'middleware',
  'repository',
  'route',
  'service'
]);

const normalizeLogPayload = (stack, level, packageName, message) => {
  const normalizedStack = String(stack || 'backend').toLowerCase();
  const normalizedLevel = String(level || 'info').toLowerCase();
  const normalizedPackage = String(packageName || 'controller').toLowerCase();

  return {
    stack: ALLOWED_STACKS.has(normalizedStack) ? normalizedStack : 'backend',
    level: ALLOWED_LEVELS.has(normalizedLevel) ? normalizedLevel : 'info',
    package: ALLOWED_BACKEND_PACKAGES.has(normalizedPackage) ? normalizedPackage : 'controller',
    message: String(message || 'API Transaction Log')
  };
};

export const Log = async (stack, level, packageName, message) => {
  try {
    const logPayload = normalizeLogPayload(stack, level, packageName, message);

    const response = await axios.post(`${BASE_URL}/logs`, logPayload, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 2500
    });

    if (response.status === 200 || response.status === 201) {
      console.log(`[Remote Log Created Successfully] ID: ${response.data.logID || response.data.logId || 'created'}`);
    }
  } catch (error) {
    if (error.response) {
      console.error('Payload Rejected By AffordMed Server:', error.response.data);
      return;
    }

    console.error('Logger Execution Failed:', error.message);
  }
};

export const loggingMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${req.method} ${req.originalUrl} resolved with status ${res.statusCode} in ${duration}ms`;

    let mappedLevel = 'info';
    if (res.statusCode >= 400 && res.statusCode < 500) {
      mappedLevel = 'warn';
    } else if (res.statusCode >= 500) {
      mappedLevel = 'error';
    }

    Log('backend', mappedLevel, 'middleware', logMessage);
  });

  next();
};
