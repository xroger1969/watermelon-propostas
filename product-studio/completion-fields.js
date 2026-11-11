import {cleanCommercialCopy} from './lib/commercial-copy.js';

// Shared validation and field scope for the editor and the completion endpoint.
export const COMPLETION_FIELDS = Object.freeze({
  title:{label:'Título público',step:1}, shortTitle:{label:'Título curto',step:1},
  destination:{label:'Destino',step:1},
  category:{label:'Categoria',step:1,options:['Private Tour','Day Trip','Walking Tour','Food & Drink','Boat Tour','Transfer','Attraction','Custom Experience']},
  duration:{label:'Duração',step:1,operational:true},
  groupType:{label:'Tipo de grupo',step:1,operational:true,options:['Private','Shared','Private / Shared options']},
  maxGuests:{label:'Máximo de participantes',step:1,operational:true,min:1,max:99,integer:true},
  summary:{label:'Resumo curto',step:2}, description:{label:'Descrição completa',step:2},
  highlights:{label:'Destaques',step:2,lines:true}, itinerary:{label:'Itinerário',step:2,lines:true,operational:true},
  included:{label:'Incluído',step:2,lines:true,operational:true}, excluded:{label:'Não incluído',step:2,lines:true,operational:true},
  meetingPoint:{label:'Ponto de encontro',step:3,operational:true}, pickup:{label:'Recolha',step:3,operational:true},
  dropoff:{label:'Regresso',step:3,operational:true},
  language:{label:'Idioma principal',step:3,operational:true,options:['English','Portuguese','Spanish','French','Multilingual']},
  questions:{label:'Perguntas ao cliente',step:3,lines:true},
  optionTitle:{label:'Nome da opção',step:4}, optionCode:{label:'Código interno da opção',step:4},
  priceType:{label:'Tipo de preço',step:4,operational:true,options:['Per person','Per group','Per vehicle','Fixed']},
  currency:{label:'Moeda',step:4,operational:true,options:['EUR','USD','GBP']},
  adultPrice:{label:'Preço principal',step:4,operational:true,min:0.01,max:100000},
  childPrice:{label:'Preço criança / secundário',step:4,operational:true,min:0,max:100000},
  days:{label:'Dias ativos',step:5,operational:true}, startTimes:{label:'Horários',step:5,operational:true},
  capacity:{label:'Capacidade por saída',step:5,operational:true,min:1,max:99,integer:true},
  cutoffHours:{label:'Antecedência de reserva (horas)',step:5,operational:true,min:0,max:168,integer:true},
  cancellation:{label:'Política de cancelamento',step:5,operational:true}
});
export const DAY_CODES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function normalizeCompletionValue(field,value){
  const rule=COMPLETION_FIELDS[field];
  if(!rule)return '';
  if(Array.isArray(value))value=value.join(rule.lines?'\n':', ');
  if(!['string','number'].includes(typeof value))return '';
  const text=cleanCommercialCopy(String(value)).slice(0,field==='description'?20000:8000);
  if(!text)return '';
  if(rule.options)return rule.options.includes(text)?text:'';
  if(rule.min!==undefined){
    const number=Number(text);
    if(!Number.isFinite(number)||number<rule.min||number>rule.max||(rule.integer&&!Number.isInteger(number)))return '';
    return String(number);
  }
  if(field==='days'){
    const values=text.split(/[,\n]+/).map(x=>x.trim()).filter(Boolean);
    return values.length&&values.every(x=>DAY_CODES.includes(x))?[...new Set(values)].join(','):'';
  }
  if(field==='startTimes'){
    const values=text.split(/[,\n]+/).map(x=>x.trim()).filter(Boolean);
    return values.length&&values.every(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(x))?[...new Set(values)].join(', '):'';
  }
  if(field==='optionCode'&&!/^[A-Z0-9-]{1,40}$/.test(text))return '';
  if(rule.lines)return cleanCommercialCopy(text,{list:true}).join('\n');
  return text;
}
export function pendingCompletionFields(product){
  return Object.entries(product?.aiCompletion?.fields||{}).filter(([field,meta])=>
    COMPLETION_FIELDS[field]&&meta.requiresReview&&(!meta.reviewed||String(product[field]??'')!==meta.value)
  ).map(([field])=>field);
}

// The existing cloud API persists inputSource as JSON. Carry editor metadata there
// so per-field review/history survives reloads without changing the database schema.
const IMPORTED_PHOTO_HOSTS = new Set(['dynamic-media.tacdn.com','media-cdn.tripadvisor.com','dynamic-media-cdn.tripadvisor.com','cache-graphicslib.viator.com']);
// Existing photos from this operator's exact Viator product remain references;
// no remote file is fetched by the server and no signed storage URL is persisted.
export function importedPhotoReferences(items,product){
  const code=String(product?.viatorCode||product?.id||'').replace(/^WM-/i,'').toUpperCase();
  if(!/^\d+P\d+$/.test(code))return [];
  const seen=new Set(),result=[];
  for(const item of Array.isArray(items)?items:[]){
    if(item?.path||item?.source!=='existing-watermelon-viator-listing'||item?.sourceProductCode!==code)continue;
    try{
      const url=new URL(item.url),source=new URL(item.sourceUrl);
      if(url.protocol!=='https:'||url.username||url.password||url.port||!IMPORTED_PHOTO_HOSTS.has(url.hostname))continue;
      if(source.protocol!=='https:'||source.username||source.password||source.port||!['viator.com','www.viator.com'].includes(source.hostname)||!source.pathname.endsWith('-'+code))continue;
      const identity=url.hostname+url.pathname;
      if(seen.has(identity))continue;
      seen.add(identity);url.hash='';
      result.push({url:url.href,name:String(item.name||'viator-photo.jpg').slice(0,150),source:item.source,sourceProductCode:code,sourceUrl:source.href,sourcePhotoId:String(item.sourcePhotoId||identity).slice(0,300),
        width:Number.isInteger(item.width)&&item.width>0?item.width:null,height:Number.isInteger(item.height)&&item.height>0?item.height:null,
        qualityNote:String(item.qualityNote||'').slice(0,500),isMain:!!item.isMain,sort:result.length});
      if(result.length===40)break;
    }catch{/* Ignore invalid or unrelated photo references. */}
  }
  return result;
}
export function packCompletionMetadata(product){
  if(!product||typeof product!=='object')return product;
  const inputSource=product.inputSource&&typeof product.inputSource==='object'?product.inputSource:{};
  const fieldValues=Object.fromEntries(Object.keys(COMPLETION_FIELDS).filter(f=>product[f]!==undefined).map(f=>[f,product[f]]));
  const importedMedia=importedPhotoReferences(product.gallery,product);
  const packed={...product,inputSource:{...inputSource,studioImportedMedia:importedMedia,studioFieldValues:fieldValues,studioCompletion:{
    version:1,aiCompletion:product.aiCompletion?{...product.aiCompletion,unsaved:false}:null,
    aiSourceUrl:String(product.aiSourceUrl||''),aiAutoComplete:!!product.aiAutoComplete
  }}};
  // Pass actual arrays to the legacy API so commas inside itinerary sentences
  // do not become extra lines or invalidate the associated review metadata.
  for(const [field,rule] of Object.entries(COMPLETION_FIELDS))if(rule.lines){
    packed[field]=Array.isArray(product[field])?product[field]:String(product[field]||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }
  if(Array.isArray(product.allOptions))packed.allOptions=product.allOptions.map(o=>o.optionCode===product.optionCode?{...o,...Object.fromEntries(['optionTitle','adultPrice','childPrice','priceType','currency'].filter(f=>product[f]!==undefined).map(f=>[f,product[f]]))}:o);
  return packed;
}
export function unpackCompletionMetadata(product){
  if(!product||typeof product!=='object')return product;
  const state=product?.inputSource?.studioCompletion;
  const values=state?.version===1?Object.fromEntries(Object.entries(product.inputSource.studioFieldValues||{}).filter(([f])=>Object.hasOwn(COMPLETION_FIELDS,f))):{};
  const stored=Array.isArray(product.gallery)?product.gallery:[];
  const imported=importedPhotoReferences(product.inputSource?.studioImportedMedia,product);
  const paths=new Set(stored.map(p=>p.url));
  const gallery=[...stored,...imported.filter(p=>!paths.has(p.url))];
  const restored=state?.version===1?{...product,...values,aiCompletion:state.aiCompletion||null,
    aiSourceUrl:String(state.aiSourceUrl||''),aiAutoComplete:!!state.aiAutoComplete}:product;
  return imported.length?{...restored,gallery,mainImage:gallery[0]?.url||restored.mainImage||''}:restored;
}
