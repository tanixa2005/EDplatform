import { Request, Response } from 'express';
import { HealthCheckResponse } from '@edplatform/shared';
import { env } from '../config/env.config.js';

const startTime = Date.now();

export function getHealthStatus(_req: Request, res: Response): void {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  const healthData: HealthCheckResponse = {
    status: 'healthy',
    service: 'EDplatform-API',
    version: '1.0.0',
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV
  };

  res.status(200).json({
    success: true,
    data: healthData
  });
}
