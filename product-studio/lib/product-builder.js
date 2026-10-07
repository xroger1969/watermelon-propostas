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
  required: [
    'title','shortTitle','destination','category','duration','summary','description',
    'highlights','itinerary','meetingPoint','pickup','dropoff','included','excluded',
    'language','groupType','maxGuests','optionTitle','optionCode','priceType',
    'suggestedPrice','childPrice','currency','days','startTimes','capacity',
    'cutoffHours','cancellation','questions','assumptions','missingInformation',
    'priceRationale','qualityScore'
  ]
};

const instructions = `
You are Watermelon Experiences Product Builder, a senior tour-product manager.
Turn a rough operator brief into a commercially strong, structured tourism product.

Rules:
- Public-facing commercial copy must be in natural, polished English.
- Internal uncertainty must be explicit in assumptions and missingInformation.
- Never invent supplier names, admissions, exact addresses, opening hours, licences, accessibility, meals, tickets, or services that were not supplied.
- If the meeting point is unknown, leave meetingPoint empty and add it to missingInformation.
- You may propose sensible operational defaults for pickup, start time, cancellation, capacity and booking cut-off, but record every such proposal in assumptions.
- suggestedPrice is a planning estimate, not live market research. Make it commercially plausible from the brief alone and explain the basis in priceRationale. Never claim you checked competitors or current prices.
- Prefer a complete draft over asking questions first. Missing information is highlighted for human review.
- Keep itinerary steps concise and operationally realistic.
- Title should sell the experience without clickbait.
- optionCode must be short uppercase letters, numbers and hyphens.
- No field may contain Markdown.
- The result is always a draft and must never imply it is published.
`;

function outputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

async function requestModel(model, brief) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions,
      input: brief,
      reasoning: { effort: 'medium' },
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
    const err = new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
    err.status = response.status;
    err.code = data?.error?.code || data?.error?.type || '';
    throw err;
  }

  const text = outputText(data);
  if (!text) throw new Error('A IA respondeu sem o produto estruturado.');

  return {
    product: JSON.parse(text),
    model: data.model || model,
    usage: data.usage || null
  };
}

export async function buildProduct(brief) {
  const cleanBrief = String(brief || '').trim();
  if (cleanBrief.length < 20) {
    throw new Error('Descreve um pouco melhor a experiência para a IA conseguir criar um produto útil.');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('A chave OpenAI do Product Studio ainda não está configurada.');
  }

  const primary = process.env.OPENAI_PRODUCT_MODEL || 'gpt-6.1-sol';
  try {
    return await requestModel(primary, cleanBrief);
  } catch (error) {
    const fallbackable = [400, 403, 404].includes(error?.status) &&
      /model|access|permission|not found|does not exist/i.test(error?.message || '');
    if (!fallbackable || primary === 'gpt-5.6-terra') throw error;
    return await requestModel('gpt-5.6-terra', cleanBrief);
  }
}
