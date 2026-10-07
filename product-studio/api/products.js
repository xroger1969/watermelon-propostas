export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) {
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ error:'Method not allowed' });
  }

  const base = process.env.SUPABASE_PRODUCT_STUDIO_URL;
  const key = process.env.PRODUCT_STUDIO_INTERNAL_KEY;
  if (!base || !key) return res.status(500).json({ error:'Product Studio database connection is not configured.' });

  try {
    const upstream = await fetch(`${base}/functions/v1/product-studio-api`, {
      method:req.method,
      headers:{
        'content-type':'application/json',
        'x-studio-key':key
      },
      body:req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.send(text);
  } catch (error) {
    console.error('Product Studio proxy failed', error);
    return res.status(502).json({ error:'Could not reach Product Studio database.' });
  }
}
