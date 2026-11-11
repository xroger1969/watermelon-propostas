// Account-specific preparation rules supplied by Watermelon on 10 November 2026.
// Shared by the private browser UI and the write API. No network or inferred availability.
export const GYG_SUPPLIER_ID = '831862';
export const GYG_SELECTED_CODES = Object.freeze(['WM-9963P14','WM-9963P15','WM-9963P16']);
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const money = value => value !== '' && value != null && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value) * 100) / 100 : null;
const lines = value => Array.isArray(value) ? value.map(String) : String(value || '').split(/[,\n]+/).map(v => v.trim()).filter(Boolean);
const sameMoney = (a,b) => money(a) !== null && money(a) === money(b);

export function gygPreparation(product) {
  const value = product?.inputSource?.gygPreparation;
  return value?.version === 1 ? value : null;
}

export function gygSelected(product) {
  const prep = gygPreparation(product);
  return GYG_SELECTED_CODES.includes(product?.id) && prep?.selected === true && String(prep.supplierId) === GYG_SUPPLIER_ID;
}

export function gygPriceTiers(product) {
  const price = gygPreparation(product)?.pricing;
  const perPerson = money(price?.perPerson), solo = money(price?.solo);
  if (perPerson === null || solo === null) return [];
  return [
    { minParticipants:1, maxParticipants:1, pricePerPerson:solo, totalPrice:solo },
    { minParticipants:2, maxParticipants:2, pricePerPerson:perPerson, totalPrice:Math.round(perPerson * 200) / 100 },
  ];
}

function belowPhotoMinimum(photo) {
  return photo?.width != null && (!Number.isFinite(Number(photo.width)) || Number(photo.width) < 1280) || photo?.height != null && (!Number.isFinite(Number(photo.height)) || Number(photo.height) < 960);
}

function photoIdentity(photo) {
  if (photo?.type && photo.type !== 'image') return '';
  // Known low-resolution originals cannot be approved by toggling a review flag.
  if (belowPhotoMinimum(photo)) return '';
  const candidate = photo?.url;
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      // CDN size variants of one source photo must never satisfy the seven-photo rule.
      return url.hostname + url.pathname.replace(/attractions-splice-spp-\d+x\d+/g,'attractions-splice-spp');
    } catch { return ''; }
  }
  return String(photo?.path || photo?.storagePath || '').trim();
}

export function gygPhotoCount(product) {
  return new Set((product?.gallery || []).map(photoIdentity).filter(Boolean)).size;
}

function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? date.getTime() : null;
}

export function gygSeasonDays(start,end) {
  const first = dateValue(start), last = dateValue(end);
  if (first === null || last === null || last < first) return 0;
  // At least one calendar year must contain a continuous season of 45 days.
  let longest = 0;
  for (let year = new Date(first).getUTCFullYear(); year <= new Date(last).getUTCFullYear(); year++) {
    const from = Math.max(first, Date.UTC(year,0,1));
    const to = Math.min(last, Date.UTC(year,11,31));
    longest = Math.max(longest, Math.round((to - from) / 86400000) + 1);
  }
  return longest;
}

function mainOption(product) {
  return product?.allOptions?.find(o => o.optionCode === product.optionCode) || product;
}

export function gygPreparationIssues(product,payload) {
  const issues = [], prep = gygPreparation(product), price = prep?.pricing, op = prep?.operations;
  if (!gygSelected(product)) issues.push('programa fora dos três selecionados');
  const sourceOptions = Array.isArray(product?.allOptions) && product.allOptions.length ? product.allOptions : [product || {}];
  if (sourceOptions.some(o => !['Per person','per_person'].includes(o.priceType)) || !['Per person','per_person'].includes(product?.priceType)) issues.push('preço configurado por pessoa');
  if (sourceOptions.some(o => o.currency !== 'EUR') || product?.currency !== 'EUR' || price?.currency !== 'EUR') issues.push('preços em EUR');
  const tiers = gygPriceTiers(product);
  if (tiers.length !== 2 || !sameMoney(price?.solo, Number(price?.perPerson) * 2)) issues.push('1 pessoa paga o mesmo total de 2 pessoas');
  if (tiers.some(t => t.pricePerPerson > 200)) issues.push('máximo de 200 € também para 1 pessoa');
  if (money(price?.basePerPerson) === null || !sameMoney(product?.adultPrice, price?.basePerPerson) || !sameMoney(mainOption(product)?.adultPrice,price?.basePerPerson)) issues.push('preço base confirmado e coerente com a ficha');
  if (!['website_promotion','website_standard'].includes(price?.source) || !Number.isFinite(Date.parse(price?.observedAt || ''))) issues.push('origem e data do preço no site');
  if (price?.source === 'website_standard' && !sameMoney(price.perPerson,price.basePerPerson) || price?.source === 'website_promotion' && money(price.perPerson) > money(price.basePerPerson)) issues.push('valor promocional coerente com o preço base');
  if (prep?.websiteParityConfirmed !== true) issues.push('mesmos preços no site para 1 e 2 pessoas');
  if (sourceOptions.length !== 1) issues.push('rever opções adicionais antes de incluir neste lote');
  if (op?.minParticipants !== 1) issues.push('mínimo de 1 participante');
  if (op?.confirmed !== true) issues.push('confirmar operação, dias e época');
  const days = [...new Set(lines(op?.days))];
  if (days.length < 3 || days.some(d => !DAYS.includes(d))) issues.push('pelo menos 3 dias de operação por semana');
  if (gygSeasonDays(op?.seasonStart,op?.seasonEnd) < 45) issues.push('época de pelo menos 45 dias consecutivos num ano');
  const cutoff = op?.cutoffHours;
  if (typeof cutoff !== 'number' || !Number.isFinite(cutoff) || cutoff < 0 || cutoff > 10 || sourceOptions.some(o => o.cutoffHours === '' || o.cutoffHours == null || !Number.isFinite(Number(o.cutoffHours)) || Number(o.cutoffHours) < 0 || Number(o.cutoffHours) > 10 || Number(o.cutoffHours) !== cutoff)) issues.push('antecedência de reserva até 10 horas');
  if (op?.confirmed === true && sourceOptions.some(o => JSON.stringify([...new Set(lines(o.activeDays ?? product.days))].sort()) !== JSON.stringify([...days].sort()))) issues.push('dias da ficha iguais aos dias confirmados');
  const count = gygPhotoCount(product);
  if (count < 7) issues.push(`faltam ${7 - count} fotografias adequadas e distintas (mínimo 7)`);
  if ((product?.gallery || []).some(belowPhotoMinimum)) issues.push('retirar fotografias abaixo de 1280 × 960 píxeis');
  if (prep?.photoQualityReviewed !== true) issues.push('rever qualidade e correspondência das fotografias');
  if (payload) {
    const option = payload.options?.[0];
    const matchingTiers = Array.isArray(option?.pricingTiers) && option.pricingTiers.length === 2 && option.pricingTiers.every((tier,index) => {
      const expected = tiers[index];
      return expected && tier.minParticipants === expected.minParticipants && tier.maxParticipants === expected.maxParticipants && sameMoney(tier.pricePerPerson,expected.pricePerPerson) && sameMoney(tier.totalPrice,expected.totalPrice);
    });
    if (payload.options?.length !== 1 || option?.priceType !== 'Per person' || option?.currency !== 'EUR' || option?.minParticipants !== 1 || option?.maxParticipants !== 2 || !matchingTiers || !sameMoney(option?.adultPrice,price?.perPerson)) issues.push('pacote com escalões exatos de 1 e 2 participantes');
    if (option?.bookingCutoffHours !== cutoff || JSON.stringify(option?.activeDays) !== JSON.stringify(days) || option?.seasonStart !== op?.seasonStart || option?.seasonEnd !== op?.seasonEnd) issues.push('disponibilidade do pacote igual à operação confirmada');
    if (payload.maxGuests !== 2) issues.push('pacote limitado aos escalões revistos de 1 e 2 pessoas');
    const exported = new Set((payload.photos || []).map(photoIdentity).filter(Boolean));
    const actual = new Set((product?.gallery || []).map(photoIdentity).filter(Boolean));
    if ([...exported].some(key => !actual.has(key)) || exported.size !== actual.size) issues.push('fotografias do pacote iguais à galeria revista');
  }
  return [...new Set(issues)];
}

export function gygProposalOption(product,option) {
  const prep = gygPreparation(product), op = prep?.operations || {}, tiers = gygPriceTiers(product);
  return {
    ...option, priceType:'Per person', currency:'EUR',
    adultPrice:money(prep?.pricing?.perPerson), childPrice:null,
    minParticipants:1, maxParticipants:2, pricingTiers:tiers,
    bookingCutoffHours:typeof op.cutoffHours === 'number' ? op.cutoffHours : null,
    activeDays:[...new Set(lines(op.days))], seasonStart:op.seasonStart || '', seasonEnd:op.seasonEnd || '',
  };
}
