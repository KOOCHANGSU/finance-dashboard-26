import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Redis에서 dashboard_analysis 키 삭제
    await redis.del('dashboard_analysis');

    return res.status(200).json({ 
      success: true, 
      message: 'AI 분석 데이터가 리셋되었습니다. 페이지를 새로고침하면 새로운 분석이 생성됩니다.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reset error:', error);
    return res.status(500).json({ error: 'Failed to reset data', details: error.message });
  }
}
