// socket-server/src/config/environment.ts

import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Environment variable schema with validation
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Security
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_ISSUER: z.string().url().default('https://suited-monkfish-74.clerk.accounts.dev'),
  CLERK_AUDIENCE: z.string().default('hackerchat-socket-server'),
  
  // CORS
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  
  // Database
  DATABASE_URL: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Process environment variables
const processEnv = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_ISSUER: process.env.CLERK_ISSUER,
  CLERK_AUDIENCE: process.env.CLERK_AUDIENCE,
  CLIENT_URL: process.env.CLIENT_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
};

// Validate and transform environment variables
const validateEnv = () => {
  try {
    return envSchema.parse(processEnv);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map(err => err.path.join('.'))
        .join(', ');
      throw new Error(`Missing or invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
};

// For debugging
console.log('Environment variables:', processEnv);

export const ENV = validateEnv(); 