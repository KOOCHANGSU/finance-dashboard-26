export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = process.env.fnf_report_KV_REST_API_URL;
  const token = process.env.fnf_report_KV_REST_API_TOKEN;

  const envCheck = {
    fnf_report_KV_REST_API_URL: !!process.env.fnf_report_KV_REST_API_URL,
    fnf_report_KV_REST_API_TOKEN: !!process.env.fnf_report_KV_REST_API_TOKEN,
    resolved_url: url ? url.substring(0, 35) + '...' : null,
    resolved_token: token ? '***set***' : null,
  };

  if (!url || !token) {
    return res.status(500).json({ ok: false, error: 'Missing Redis env vars', envCheck });
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url, token });
    await redis.ping();
    return res.status(200).json({ ok: true, message: 'Redis connected', envCheck });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, envCheck });
  }
}
