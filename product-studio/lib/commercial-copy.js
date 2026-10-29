// Keep marketing fields free of web-search citation artefacts. Sources belong in metadata.
const TEXT_FIELDS = [
  'title', 'shortTitle', 'destination', 'duration', 'summary', 'description',
  'highlights', 'itinerary', 'meetingPoint', 'pickup', 'dropoff', 'included',
  'excluded', 'optionTitle', 'cancellation', 'questions', 'priceRationale',
  'assumptions', 'missingInformation'
];
const LIST_FIELDS = new Set(['highlights', 'itinerary', 'included', 'excluded', 'questions', 'assumptions', 'missingInformation']);

export function cleanCommercialCopy(value, { list = false } = {}) {
  const source = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  const cleaned = source
    .replace(/\r\n?/g, '\n')
    // Language-model responses sometimes contain the two characters "\\n" instead of a line break.
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    // Typical citation forms: ([provider.com](https://...)) or (provider.com)(https://...).
    .replace(/\(\s*\[[^\]]+\]\(https?:\/\/[^)\s]+\)\s*\)/gi, '')
    .replace(/\(\s*(?:[\w-]+\.)+[a-z]{2,}\s*\)\s*\(https?:\/\/[^)\s]+\)/gi, '')
    .replace(/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/gi, '')
    // No raw URLs or tool citations in customer-facing copy.
    .replace(/\(\s*https?:\/\/[^)\s]+\)/gi, '')
    .replace(/\bhttps?:\/\/[^\s<>\])}]+/gi, '')
    .replace(/\bwww\.[\w.-]+(?:\/[^\s<>\])}]*)?/gi, '')
    .replace(/(?:cite[^]+|【turn\w+】)/g, '')
    .replace(/\(\s*(?:www\.)?(?:getyourguide|viator|tripadvisor)\.(?:com|pt)\s*\)/gi, '')
    .replace(/\[\s*(?:www\.)?(?:getyourguide|viator|tripadvisor)\.(?:com|pt)\s*\]/gi, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!list) return cleaned;
  const seen = new Set();
  return cleaned.split(/\n+/).map(line => line.trim()).filter(line => {
    if (!line) return false;
    const key = line.toLocaleLowerCase('en').replace(/^[\s•\-*\d.)]+/, '').replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function cleanDraftProduct(product) {
  const output = { ...product };
  for (const field of TEXT_FIELDS) {
    if (typeof product?.[field] === 'string' || Array.isArray(product?.[field])) {
      output[field] = cleanCommercialCopy(product[field], { list: LIST_FIELDS.has(field) });
    }
  }
  return output;
}
