import { NextApiRequest, NextApiResponse } from 'next'

type HealthResponse = {
  status: 'OK' | 'ERROR'
  timestamp: string
  service: string
  version: string
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      service: 'health-check-api',
      version: process.env.APP_VERSION || '1.0.0'
    })
  }

  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'health-check-api',
    version: process.env.APP_VERSION || '1.0.0'
  })
}