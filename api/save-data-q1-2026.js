import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.fnf_report_KV_REST_API_URL,
  token: process.env.fnf_report_KV_REST_API_TOKEN,
});

// Vercel serverless function에서 req.body 수동 파싱
const parseBody = (req) =>
  new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      // 이미 파싱된 경우 (Next.js 등)
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await parseBody(req);

    if (!data) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Redis에 데이터 저장 (키: 'dashboard_analysis_q1_2026')
    await redis.set('dashboard_analysis_q1_2026', JSON.stringify({
      ...data,
      lastUpdated: new Date().toISOString(),
    }));

    return res.status(200).json({
      success: true,
      message: '데이터가 저장되었습니다.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Save error:', error);
    return res.status(500).json({ error: 'Failed to save data', details: error.message });
  }
}
