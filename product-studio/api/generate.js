export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const brief = String(req.body?.brief || '').trim();
    if (brief.length < 20) {
      return res.status(400).json({ error: 'Descreve um pouco melhor a experiência para a IA conseguir criar um produto útil.' });
    }

    const token = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
    if (!token) {
      return res.status(500).json({ error: 'AI Gateway authentication is not configured.' });
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        shortTitle: { type: 'string' },
        destination: { type: 'string' },
        category: { type: 'string', enum: ['Private Tour','Day Trip','Walking Tour','Food & Drink','Boat Tour','Transfer','Attraction','Custom Experience'] },
        duration: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        highlights: { type: 'array', items: { type: 'string' } },
        itinerary: { type: 'array', items: { type: 'string' } },
        meetingPoint: { type: 'string' },
        pickup: { type: 'string' },
        dropoff: { type: 'string' },
        included: { type: 'array', items: { type: 'string' } },
        excluded: { type: 'array', items: { type: 'string' } },
        language: { type: 'string', enum: ['English','Portuguese','Spanish','French','Multilingual'] },
        groupType: { type: 'string', enum: ['Private','Shared','Private / Shared options'] },
        maxGuests: { type: 'integer', minimum: 1, maximum: 99 },
        optionTitle: { type: 'string' },
        optionCode: { type: 'string' },
        priceType: { type: 'string', enum: ['Per person','Per group','Per vehicle','Fixed'] },
        suggestedPrice: { type: 'number', minimum: 0 },
        childPrice: { type: 'number', minimum: 0 },
        currency: { type: 'string', enum: ['EUR','USD','GBP'] },
        days: { type: 'array', items: { type: 'string', enum: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] } },
        startTimes: { type: 'array', items: { type: 'string' } },
        capacity: { type: 'integer', minimum: 1, maximum: 99 },
        cutoffHours: { type: 'integer', minimum: 0, maximum: 168 },
        cancellation: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        missingInformation: { type: 'array', items: { type: 'string' } },
        priceRationale: { type: 'string' },
        qualityScore: { type: 'integer', minimum: 0, maximum: 100 }
      },
      required: ['title','shortTitle','destination','category','duration','summary','description','highlights','itinerary','meetingPoint','pickup','dropoff','included','excluded','language','groupType','maxGuests','optionTitle','optionCode','priceType','suggestedPrice','childPrice','currency','days','startTimes','capacity','cutoffHours','cancellation','questions','assumptions','missingInformation','priceRationale','qualityScore']
    };

    const instructions = `
You are Watermelon Experiences Product Builder, a senior tour-product manager.
Turn a rough operator brief into a commercially strong, structured tourism product.

Rules:
- Public-facing commercial copy must be in natural, polished English.
- Internal uncertainty must be explicit in assumptions and missingInformation.
- Never invent supplier names, admissions, exact addresses, opening hours, licences, accessibility, meals, tickets, or services that were not supplied.
- If the meeting point is unknown, leave meetingPoint empty and add it to missingInformation.
- You may propose a sensible operational default for pickup, start time, cancellation, capacity and booking cut-off, but record every such proposal in assumptions.
- suggestedPrice is a planning estimate, not live market research. Make it commercially plausible for the brief and explain the basis in priceRationale. Never claim you checked competitors or current prices.
- Prefer a complete draft over asking questions first. Missing information is highlighted for human review.
- Keep itinerary steps concise and operationally realistic.
- Title should sell the experience without clickbait.
- optionCode should be short uppercase letters/numbers/hyphens.
- No field may contain Markdown.
- The result is always a draft and must never imply it is published.
`;

    const response = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || 'openai/gpt-6.1-sol',
        reasoning: { effort: 'medium' },
        instructions,
        input: brief,
        text: {
          format: {
            type: 'json_schema',
            name: 'watermelon_product',
            strict: true,
            schema
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('AI Gateway error', data);
      return res.status(response.status).json({ error: data?.error?.message || 'A IA não conseguiu gerar o produto.' });
    }

    let outputText = data.output_text;
    if (!outputText && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;
        const part = item.content.find(p => p.type === 'output_text' && typeof p.text === 'string');
        if (part) { outputText = part.text; break; }
      }
    }
    if (!outputText) return res.status(502).json({ error: 'A IA respondeu sem o produto estruturado.' });

    const product = JSON.parse(outputText);
    return res.status(200).json({
      product,
      model: data.model || process.env.AI_GATEWAY_MODEL || 'openai/gpt-6.1-sol',
      usage: data.usage || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno ao gerar o produto com IA.' });
  }
}
