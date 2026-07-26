import { Logger } from '@nestjs/common';

const logger = new Logger('Config');

function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        logger.error(`Missing required environment variable: ${key}`);
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export const JWT_SECRET = getRequiredEnv('JWT_SECRET');
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';