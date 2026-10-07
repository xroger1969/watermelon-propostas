import { buildProduct } from '../lib/product-builder.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await buildProduct(req.body?.brief);
    return res.status(200).json(result);
  } catch (error) {
    console.error('AI product generation failed', error);
    return res.status(500).json({
      error: error?.message || 'Erro interno ao gerar o produto com IA.'
    });
  }
}
