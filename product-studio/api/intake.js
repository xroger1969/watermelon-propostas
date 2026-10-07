import { buildProductFromSource } from '../lib/product-builder.js';

function isPrivateHostname(hostname){
  const h=String(hostname||'').toLowerCase();
  if(!h||h==='localhost'||h.endsWith('.local')||h==='::1')return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^169\.254\./.test(h)||/^192\.168\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./);
  if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  return false;
}
function decodeEntities(text){
  return String(text||'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function htmlToText(html){
  return decodeEntities(String(html||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/[ \t]+/g,' ')
    .replace(/\n\s*\n+/g,'\n')
  ).trim().slice(0,50000);
}
async function fetchPublicPage(rawUrl){
  let current=String(rawUrl||'').trim();
  if(!current)return null;
  for(let hop=0;hop<4;hop++){
    const u=new URL(current);
    if(!['http:','https:'].includes(u.protocol)||isPrivateHostname(u.hostname))throw new Error('Este endereço não pode ser consultado.');
    const response=await fetch(u.toString(),{
      method:'GET',
      redirect:'manual',
      headers:{
        'accept':'text/html,text/plain;q=0.9,*/*;q=0.2',
        'user-agent':'Mozilla/5.0 (compatible; WatermelonProductStudio/1.0; +https://watermelonexperiences.pt/)'
      },
      signal:AbortSignal.timeout(15000)
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location)break;
      current=new URL(location,u).toString();
      continue;
    }
    if(!response.ok)return null;
    const type=(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html')&&!type.includes('text/plain'))return null;
    const html=await response.text();
    const text=htmlToText(html);
    if(text.length<120)return null;
    return {url:u.toString(),text};
  }
  return null;
}

async function storageAction(action, extra={}) {
  const base = process.env.SUPABASE_PRODUCT_STUDIO_URL;
  const key = process.env.PRODUCT_STUDIO_INTERNAL_KEY;
  if (!base || !key) throw new Error('Product Studio storage is not configured.');
  const r = await fetch(`${base}/functions/v1/product-studio-storage`, {
    method:'POST',
    headers:{'content-type':'application/json','x-studio-key':key},
    body:JSON.stringify({action,...extra})
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'Storage request failed');
  return data;
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  try{
    let source={...(req.body||{})};
    if(source.mode==='url'||source.mode==='viator'){
      const ref=String(source.url||source.reference||'').trim();
      try{
        const page=await fetchPublicPage(ref);
        if(page){source.pageText=page.text;source.resolvedUrl=page.url}
      }catch(error){
        console.warn('Direct source fetch unavailable',error?.message||error);
      }
    }
    if(source.mode==='storage_file'){
      if(!source.storagePath) throw new Error('Caminho do ficheiro em falta.');
      const signed=await storageAction('read-url',{path:source.storagePath});
      source.fileUrl=signed.signedUrl;
    }
    if(source.mode==='bundle'){
      const items=Array.isArray(source.sources)?source.sources:[];
      if(!items.length) throw new Error('O conjunto não tem fontes.');
      if(items.length>12) throw new Error('Usa no máximo 12 fontes por produto.');
      let combinedFileBytes=0;
      source.sources=[];
      for(const item of items){
        const next={...item};
        if(next.kind==='file'||next.kind==='image'){
          if(!next.storagePath) throw new Error('Uma das fontes privadas não tem caminho de armazenamento.');
          const size=Number(next.size||0);
          if(next.kind==='file') combinedFileBytes+=size;
          const signed=await storageAction('read-url',{path:next.storagePath});
          next.fileUrl=signed.signedUrl;
        }
        if(next.kind==='url'||next.kind==='viator'){
          try{
            const page=await fetchPublicPage(next.url);
            if(page){next.pageText=page.text;next.resolvedUrl=page.url}
          }catch(error){
            console.warn('Direct bundle URL fetch unavailable',next.url,error?.message||error);
          }
        }
        source.sources.push(next);
      }
      if(combinedFileBytes>48*1024*1024) throw new Error('Os documentos do conjunto ultrapassam 48 MB no total.');
    }
    const result=await buildProductFromSource(source);
    if(source.mode==='storage_file'){
      result.sourceLabel=source.fileName||source.storagePath;
      result.sourceMode='storage_file';
      result.sourceReferences=[
        ...(result.sourceReferences||[]),
        {type:'private_storage',path:source.storagePath,fileName:source.fileName||'',mimeType:source.mimeType||''}
      ];
    }
    return res.status(200).json(result);
  }catch(error){
    console.error('Product intake failed',error);
    return res.status(500).json({error:error?.message||'Não foi possível criar o produto a partir desta fonte.'});
  }
}
