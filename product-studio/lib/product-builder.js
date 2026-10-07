
const productSchema = {
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

const marketSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    method: { type:'string', enum:['market_researched','provisional'] },
    recommendedPrice: { type:'number', minimum:0 },
    currency: { type:'string', enum:['EUR','USD','GBP'] },
    lowMarketPrice: { type:'number', minimum:0 },
    medianMarketPrice: { type:'number', minimum:0 },
    highMarketPrice: { type:'number', minimum:0 },
    confidence: { type:'string', enum:['high','medium','low'] },
    pricedComparableCount: { type:'integer', minimum:0, maximum:12 },
    marketPosition: { type:'string' },
    rationale: { type:'string' },
    comparables: {
      type:'array',
      maxItems:8,
      items:{
        type:'object',
        additionalProperties:false,
        properties:{
          provider:{type:'string'},
          title:{type:'string'},
          url:{type:'string'},
          observedPrice:{type:'number',minimum:0},
          currency:{type:'string'},
          priceBasis:{type:'string'},
          duration:{type:'string'},
          relevance:{type:'string',enum:['high','medium','low']},
          notes:{type:'string'}
        },
        required:['provider','title','url','observedPrice','currency','priceBasis','duration','relevance','notes']
      }
    }
  },
  required:[
    'method','recommendedPrice','currency','lowMarketPrice','medianMarketPrice','highMarketPrice',
    'confidence','pricedComparableCount','marketPosition','rationale','comparables'
  ]
};

const baseInstructions = `
You are Watermelon Experiences Product Builder, a senior tour-product manager.
Create a commercially strong, operationally realistic tourism product from the supplied source.

Rules:
- Public-facing commercial copy must be original, natural, polished English.
- Extract facts from the source, but do not copy another operator's prose or distinctive marketing text.
- Internal uncertainty must be explicit in assumptions and missingInformation.
- Never invent supplier names, admissions, exact addresses, opening hours, licences, accessibility, meals, tickets, or services that are not supported by the source.
- If the meeting point is unknown, leave meetingPoint empty and add it to missingInformation.
- You may propose sensible operational defaults for pickup, start time, cancellation, capacity and booking cut-off, but record every such proposal in assumptions.
- suggestedPrice in this first drafting step is only an internal provisional estimate. A separate live market research step will validate or replace it.
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

function webSources(data) {
  const seen = new Set();
  const out = [];
  for (const item of data?.output || []) {
    const sources = item?.action?.sources || item?.sources || [];
    for (const s of sources) {
      const url = s?.url || s?.link;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title:s?.title || '', type:s?.type || 'web' });
    }
  }
  return out.slice(0,20);
}

async function callStructured({model, input, schema, schemaName, instructions, tools, include}) {
  const body = {
    model,
    instructions,
    input,
    reasoning: { effort: 'medium' },
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema
      }
    }
  };
  if (tools?.length) body.tools = tools;
  if (include?.length) body.include = include;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
    err.status = response.status;
    err.code = data?.error?.code || data?.error?.type || '';
    throw err;
  }
  const text = outputText(data);
  if (!text) throw new Error('A IA respondeu sem dados estruturados.');
  return { object:JSON.parse(text), raw:data, model:data.model || model, usage:data.usage || null };
}

async function withModelFallback(fn) {
  const primary = process.env.OPENAI_PRODUCT_MODEL || 'gpt-6.1-sol';
  try {
    return await fn(primary);
  } catch (error) {
    const fallbackable = [400,403,404].includes(error?.status) &&
      /model|access|permission|not found|does not exist/i.test(error?.message || '');
    if (!fallbackable || primary === 'gpt-5.6-terra') throw error;
    return await fn('gpt-5.6-terra');
  }
}

function domainFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; }
}

export async function draftProduct(source) {
  if (!process.env.OPENAI_API_KEY) throw new Error('A chave OpenAI do Product Studio ainda não está configurada.');

  const mode = source?.mode || 'text';
  let input;
  let tools;
  let sourceLabel = mode;

  if (mode === 'text') {
    const brief = String(source?.brief || '').trim();
    if (brief.length < 20) throw new Error('Descreve um pouco melhor a experiência.');
    input = brief;
  } else if (mode === 'image') {
    if (!source?.dataUrl) throw new Error('Fotografia em falta.');
    input = [{
      role:'user',
      content:[
        {type:'input_text',text:'Use this photograph plus any accompanying note to create a new Watermelon experience draft. Identify only what the image supports; flag anything uncertain. Accompanying note: '+String(source?.brief || '')},
        {type:'input_image',image_url:source.dataUrl,detail:'high'}
      ]
    }];
    sourceLabel = source?.fileName || 'photo';
  } else if (mode === 'file') {
    if (!source?.dataUrl) throw new Error('Ficheiro em falta.');
    const part = {
      type:'input_file',
      filename:source?.fileName || 'source-file',
      file_data:source.dataUrl
    };
    if ((source?.mimeType || '').includes('pdf')) part.detail = 'high';
    input = [{
      role:'user',
      content:[
        {type:'input_text',text:'Analyse this operator/programme document. Extract factual product details and create a new, original Watermelon experience draft. Do not copy the source wording. Note: '+String(source?.brief || '')},
        part
      ]
    }];
    sourceLabel = source?.fileName || 'document';
  } else if (mode === 'url' || mode === 'viator') {
    const ref = String(source?.url || source?.reference || '').trim();
    if (!ref) throw new Error('Ligação ou referência em falta.');
    const domain = domainFromUrl(ref);
    const allowed = mode === 'viator'
      ? ['viator.com','tripadvisor.com']
      : (domain ? [domain] : undefined);
    tools = [{
      type:'web_search',
      search_context_size:'high',
      ...(allowed ? {filters:{allowed_domains:allowed}} : {})
    }];
    input = mode === 'viator'
      ? `Find and analyse this Viator experience/reference: ${ref}. Extract its factual structure, logistics, inclusions, duration and options where available. Then create an original Watermelon draft inspired by those facts; do not copy the source wording. If the exact product cannot be verified, say so through missingInformation rather than guessing.`
      : `Open and analyse this experience/programme URL: ${ref}. Extract factual details that are actually supported by the page. Create an original Watermelon product draft from those facts; do not copy the source wording. If the URL cannot be verified, flag that in missingInformation.`;
    sourceLabel = ref;
  } else {
    throw new Error('Tipo de entrada não suportado.');
  }

  return await withModelFallback(async model => {
    const r = await callStructured({
      model,
      input,
      schema:productSchema,
      schemaName:'watermelon_product',
      instructions:baseInstructions,
      tools,
      include:tools ? ['web_search_call.action.sources'] : undefined
    });
    return {
      product:r.object,
      model:r.model,
      usage:r.usage,
      sourceLabel,
      sourceMode:mode,
      sourceReferences:tools ? webSources(r.raw) : []
    };
  });
}

export async function researchMarket(product) {
  const snapshot = {
    title:product.title,
    destination:product.destination,
    category:product.category,
    duration:product.duration,
    groupType:product.groupType,
    maxGuests:product.maxGuests,
    priceType:product.priceType,
    included:product.included,
    excluded:product.excluded,
    provisionalEstimate:product.suggestedPrice,
    currency:product.currency
  };

  const marketInstructions = `
You are the market-pricing analyst for Watermelon Experiences.
Research current public selling prices for genuinely comparable tourism experiences.

Research rules:
- Search the live web. Prioritise Viator first, then GetYourGuide, Tripadvisor, Civitatis and direct/local operator websites when useful.
- Compare like with like: same destination/route, duration, private vs shared format, group size, inclusions and price basis.
- Only include a comparable when you can verify a numeric public selling price and a real source URL.
- Do not invent prices, URLs, providers or inclusions.
- Ignore irrelevant attraction ticket prices, add-ons, deposits and obvious partial fees.
- State the price basis exactly when visible (per person, per group, from price, etc.).
- Prefer at least 3 priced comparables. Three or more strong priced comparables can justify high confidence; two usually medium; fewer than two must be low and method provisional.
- recommendedPrice is a Watermelon public selling-price recommendation, not a supplier cost.
- Position Watermelon competitively; do not automatically choose the cheapest price.
- lowMarketPrice, medianMarketPrice and highMarketPrice must be based on the included priced comparables when there are at least 2. If there are fewer than 2, use the provisional estimate for all three and explain the limitation.
- Use the product currency where practical.
- Never claim that a source was checked unless it appears in comparables.
`;

  return await withModelFallback(async model => {
    const r = await callStructured({
      model,
      input:`Research a market price for this draft product:\n${JSON.stringify(snapshot)}`,
      schema:marketSchema,
      schemaName:'watermelon_market_price',
      instructions:marketInstructions,
      tools:[{
        type:'web_search',
        search_context_size:'high'
      }],
      include:['web_search_call.action.sources']
    });
    const market = r.object;
    market.searchedAt = new Date().toISOString();
    market.webSources = webSources(r.raw);
    return {marketResearch:market, marketModel:r.model, marketUsage:r.usage};
  });
}

export async function buildProductFromSource(source) {
  const drafted = await draftProduct(source);
  let marketResearch = null;
  let marketModel = null;
  try {
    const market = await researchMarket(drafted.product);
    marketResearch = market.marketResearch;
    marketModel = market.marketModel;
    if (marketResearch?.recommendedPrice > 0) {
      drafted.product.suggestedPrice = marketResearch.recommendedPrice;
      drafted.product.currency = marketResearch.currency || drafted.product.currency;
      drafted.product.priceRationale = marketResearch.rationale;
    }
  } catch (error) {
    console.error('Market research failed; keeping provisional estimate', error);
    marketResearch = {
      method:'provisional',
      recommendedPrice:drafted.product.suggestedPrice || 0,
      currency:drafted.product.currency || 'EUR',
      lowMarketPrice:drafted.product.suggestedPrice || 0,
      medianMarketPrice:drafted.product.suggestedPrice || 0,
      highMarketPrice:drafted.product.suggestedPrice || 0,
      confidence:'low',
      pricedComparableCount:0,
      marketPosition:'Provisional — live market research unavailable',
      rationale:'Live market research could not be completed. The displayed amount remains an AI planning estimate and must be reviewed manually.',
      comparables:[],
      searchedAt:new Date().toISOString(),
      webSources:[]
    };
  }
  return {...drafted, marketResearch, marketModel};
}

export async function buildProduct(brief) {
  return buildProductFromSource({mode:'text',brief});
}
