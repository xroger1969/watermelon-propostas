import { buildProduct } from '../lib/product-builder.js';

export default async function handler(req, res) {
  try {
    const result = await buildProduct(
      'Create a private Lisbon highlights tour lasting 4 hours for up to 8 guests. Hotel pickup in Lisbon. Include private transport and guide, exclude monument tickets. Suggest a sensible starting time and a draft selling price.'
    );

    return res.status(200).json({
      ok: true,
      model: result.model,
      sample: {
        title: result.product.title,
        destination: result.product.destination,
        category: result.product.category,
        suggestedPrice: result.product.suggestedPrice,
        currency: result.product.currency,
        qualityScore: result.product.qualityScore,
        missingInformation: result.product.missingInformation
      }
    });
  } catch (error) {
    console.error('AI self-test failed', error);
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}
