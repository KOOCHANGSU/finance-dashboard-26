import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.fnf_report_KV_REST_API_URL,
  token: process.env.fnf_report_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // CORS 헤더 설정
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
    const data = req.body;

    // 데이터 유효성 검사
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Save error:', error);
    return res.status(500).json({ error: 'Failed to save data', details: error.message });
  }
}
