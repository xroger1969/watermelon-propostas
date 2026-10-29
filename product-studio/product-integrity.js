// Shared, deterministic commercial integrity rules. No credentials or network access.
export const PRICE_FIELDS = ['adultPrice','childPrice','priceType','currency'];
export const PRICE_TYPES = ['Per person','Per group','Per vehicle','Fixed'];
const CURRENCIES = ['EUR','USD','GBP'];
const PUBLIC_FIELDS = ['title','shortTitle','destination','category','duration','summary','description','highlights','itinerary','meetingPoint','pickup','dropoff','included','excluded','language','groupType','maxGuests','questions','cancellation','days','startTimes','capacity','cutoffHours','viatorCode','pricingProvider','availabilityProvider'];
const fold = value => String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
const text = value => Array.isArray(value) ? value.join('\n') : String(value ?? '');
export function sourceIdentity(reference) {
  const ref=String(reference||'').trim();
  if(/^\d+P\d+$/i.test(ref))return {provider:'viator',label:'Viator',id:ref.toUpperCase(),url:''};
  try {
    const u=new URL(ref);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    const host=u.hostname.toLowerCase();u.hash='';u.search='';
    if(/(^|\.)getyourguide\.com$/.test(host))return {provider:'getyourguide',label:'GetYourGuide',id:u.pathname.match(/-t(\d+)(?:\/|$)/i)?.[1]||'',url:u.href};
    if(/(^|\.)viator\.com$/.test(host))return {provider:'viator',label:'Viator',id:u.pathname.match(/(?:^|[-/])(\d+P\d+)(?:$|[-/])/i)?.[1]?.toUpperCase()||'',url:u.href};
    return {provider:'website',label:host.replace(/^www\./,''),id:'',url:u.href};
  }catch{return null;}
}
export function productSource(product) {
  const p=product||{}, input=p.inputSource||{};
  const direct=[p.aiSourceUrl,input.label,...(input.references||[]).filter(s=>['url','viator','getyourguide'].includes(s.type)).map(s=>s.url),p.viatorCode];
  return direct.map(sourceIdentity).find(Boolean)||null;
}
export function sameSource(a,b) {
  const x=sourceIdentity(a),y=sourceIdentity(b);
  if(!x||!y||x.provider!==y.provider)return false;
  return x.id&&y.id?x.id===y.id:x.url&&x.url===y.url;
}
export function evidencePrice(excerpt) {
  const s=String(excerpt||'');
  const money=/(?:€|EUR|\$|USD|£|GBP)\s*(\d[\d.,\u00a0 ]*\d|\d)|(\d[\d.,\u00a0 ]*\d|\d)\s*(?:€|EUR|\$|USD|£|GBP)/gi;
  const amounts=[...s.matchAll(money)].map(m=>{
    let n=(m[1]||m[2]).replace(/[\s\u00a0]/g,'');
    if(/[.,]\d{1,2}$/.test(n)){const at=Math.max(n.lastIndexOf(','),n.lastIndexOf('.'));n=n.slice(0,at).replace(/[.,]/g,'')+'.'+n.slice(at+1);}
    else n=n.replace(/[.,]/g,'');
    return Number(n);
  });
  const unique=[...new Set(amounts)];
  const currencies=[/€|\bEUR\b/i.test(s)?'EUR':'',/\$|\bUSD\b/i.test(s)?'USD':'',/£|\bGBP\b/i.test(s)?'GBP':''].filter(Boolean);
  const units=[[/per\s+(?:person|adult)|por\s+pessoa|\/\s*(?:person|pessoa|adult)/i,'Per person'],[/per\s+group|por\s+grupo|\/\s*group/i,'Per group'],[/per\s+(?:vehicle|quad)|por\s+(?:ve[ií]culo|quad)|\/\s*(?:vehicle|quad)/i,'Per vehicle']].filter(([re])=>re.test(s)).map(([,unit])=>unit);
  return {amount:unique.length===1?unique[0]:null,currency:currencies.length===1?currencies[0]:'',unit:units.length===1?units[0]:''};
}
export function normalizeSourcePrice(candidate, {reference='',pageText='',retrieved=[]}={}) {
  const c=candidate||{},identity=sourceIdentity(reference);
  const result={amount:null,currency:'',unit:'',sourceUrl:identity?.url||'',provider:identity?.label||'',excerpt:'',qualifier:'unknown',status:'missing',observedAt:new Date().toISOString(),note:'Preço da fonte não confirmado. Não foi estimado nem convertido.'};
  if(!c.excerpt||!sameSource(c.sourceUrl,reference))return result;
  const parsed=evidencePrice(c.excerpt);
  if(!(parsed.amount>0)||parsed.amount!==Number(c.amount)||parsed.currency!==c.currency||parsed.unit!==c.unit)return result;
  const direct=!!pageText&&fold(pageText).includes(fold(c.excerpt));
  const found=retrieved.some(s=>sameSource(s.url||s,reference));
  if(!direct&&!found)return result;
  return {...result,...parsed,sourceUrl:sourceIdentity(c.sourceUrl)?.url||result.sourceUrl,excerpt:String(c.excerpt).slice(0,1200),qualifier:['from','advertised','date_specific'].includes(c.qualifier)?c.qualifier:'advertised',status:direct?'extracted':'reported',note:direct?'Preço observado no texto da fonte; confirmar data, opção e condições.':'Preço indicado pela pesquisa; exige confirmação na fonte. Não é disponibilidade em tempo real.'};
}
export function separatePricing(product,market,sourcePrice) {
  return {version:1,source:sourcePrice||null,suggestion:market?.recommendedPrice>0?{amount:Number(market.recommendedPrice),currency:market.currency||'',unit:PRICE_TYPES.includes(market.priceType)?market.priceType:'',confidence:market.confidence||'low',method:market.method||'provisional',rationale:market.rationale||'',requiresApproval:true}:null,initialEstimate:Number(product?.suggestedPrice)||null};
}
export function optionsForReview(p) {
  const fields=['optionCode','optionTitle','adultPrice','childPrice','priceType','currency'];
  const main=Object.fromEntries(fields.map(f=>[f,text(p?.[f])]));
  const others=(p?.allOptions||[]).filter(o=>o.optionCode!==p.optionCode).map(o=>Object.fromEntries(fields.map(f=>[f,text(o[f])])));
  return [main,...others];
}
export function priceFingerprint(p) {return JSON.stringify(optionsForReview(p));}
export function reviewFingerprint(p) {
  return JSON.stringify([PUBLIC_FIELDS.map(f=>text(p?.[f])),optionsForReview(p),(p?.allOptions||[]).filter(o=>o.optionCode!==p.optionCode).map(o=>[o.optionCode,o.startTimes,o.activeDays,o.capacity,o.cutoffHours]),p?.aiAssumptions||[],p?.aiMissing||[],(p?.gallery||[]).map(g=>g.path||g.url||'')]);
}
export function safetyState(p) {return p?.inputSource?.studioSafety||{};}
export function ensureSafety(p) {
  p.inputSource=p.inputSource&&typeof p.inputSource==='object'?p.inputSource:{};
  return p.inputSource.studioSafety||=( {version:1} );
}
export function validateSellingPrice(p) {
  const errors=[];
  for(const [index,o] of optionsForReview(p).entries()) {
    // Inactive/unfinished secondary options are retained, not silently made bookable.
    if(index>0&&!o.adultPrice)continue;
    if(!(Number(o.adultPrice)>0)||!Number.isFinite(Number(o.adultPrice)))errors.push('preço positivo');
    if(!PRICE_TYPES.includes(o.priceType))errors.push('unidade de preço (pessoa/grupo/veículo)');
    if(!CURRENCIES.includes(o.currency))errors.push('moeda');
    if(o.childPrice!==''&&(!Number.isFinite(Number(o.childPrice))||Number(o.childPrice)<0))errors.push('preço criança válido');
    if(o.childPrice!==''&&o.priceType!=='Per person')errors.push('retirar preço criança de opções por grupo/veículo');
  }
  return [...new Set(errors)];
}
export function publicationIssues(p) {
  if(!p)return ['produto em falta'];
  const issues=validateSellingPrice(p),s=safetyState(p);
  if(!(p.gallery||[]).some(g=>g.path||g.url))issues.push('imagem principal do operador');
  if(s.priceApproved!==priceFingerprint(p))issues.push('aprovação explícita do preço de venda');
  if(s.reviewApproved!==reviewFingerprint(p))issues.push('revisão dos dados e condições do programa');
  const required=['title','destination','duration','description','itinerary','included','language','groupType','maxGuests','capacity','days','startTimes','cancellation'];
  for(const field of required)if(!text(p[field]).trim())issues.push('confirmar '+field);
  if(!text(p.meetingPoint).trim()&&!text(p.pickup).trim())issues.push('ponto de encontro ou recolha');
  if(!(Number(p.capacity)>0)||!Number.isInteger(Number(p.capacity))||!(Number(p.maxGuests)>0)||!Number.isInteger(Number(p.maxGuests)))issues.push('lotação válida');
  if(text(p.cutoffHours)===''||!Number.isInteger(Number(p.cutoffHours))||Number(p.cutoffHours)<0||Number(p.cutoffHours)>168)issues.push('antecedência de reserva válida');
  if(text(p.days)&&!text(p.days).split(/[,\n]+/).every(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(d.trim())))issues.push('dias de operação válidos');
  if(text(p.startTimes)&&!text(p.startTimes).split(/[,\n]+/).every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim())))issues.push('horários válidos');
  return [...new Set(issues)];
}
export function approveSellingPrice(p) {
  const issues=validateSellingPrice(p);if(issues.length)throw new Error('Confirma: '+issues.join(', '));
  const state=ensureSafety(p);state.priceApproved=priceFingerprint(p);state.priceApprovedAt=new Date().toISOString();
}
export function approveProductReview(p) {
  const s=ensureSafety(p);s.reviewApproved=reviewFingerprint(p);s.reviewApprovedAt=new Date().toISOString();
  for(const meta of Object.values(p.aiCompletion?.fields||{})){meta.reviewed=true;meta.reviewedAt=s.reviewApprovedAt;}
}
export function priceProposalConsistent(field,value,evidence,product) {
  const v=evidencePrice(evidence);
  if(field==='adultPrice'||field==='childPrice')return v.amount===Number(value)&&!!v.currency&&!!v.unit&&(!product?.priceType||v.unit===product.priceType)&&(!product?.currency||v.currency===product.currency);
  if(field==='priceType')return !!v.unit&&v.unit===value;
  if(field==='currency')return !!v.currency&&v.currency===value;
  return true;
}

export const SOURCE_PRICE_SCHEMA={type:'object',additionalProperties:false,properties:{amount:{type:['number','null'],minimum:0},currency:{type:'string',enum:['','EUR','USD','GBP']},unit:{type:'string',enum:['',...PRICE_TYPES]},sourceUrl:{type:'string'},excerpt:{type:'string'},qualifier:{type:'string',enum:['unknown','from','advertised','date_specific']}},required:['amount','currency','unit','sourceUrl','excerpt','qualifier']};
export function retrievedUrls(raw){const out=[];for(const item of raw?.output||[]){for(const x of item.action?.sources||item.sources||[])if(x.url)out.push({url:x.url});for(const part of item.content||[])for(const x of part.annotations||[])if(x.type==='url_citation'&&x.url)out.push({url:x.url});}return out;}
