import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.fnf_report_KV_REST_API_URL,
  token: process.env.fnf_report_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Redis에서 데이터 불러오기
    const data = await redis.get('dashboard_analysis');
    
    if (!data) {
      return res.status(200).json({ 
        success: true, 
        data: null,
        message: '저장된 데이터가 없습니다.'
      });
    }

    // data가 이미 객체인 경우와 문자열인 경우 처리
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

    return res.status(200).json({ 
      success: true, 
      data: parsedData
    });
  } catch (error) {
    console.error('Load error:', error);
    return res.status(500).json({ error: 'Failed to load data', details: error.message });
  }
}
