import {packCompletionMetadata,unpackCompletionMetadata} from '../completion-fields.js';
import {publicationIssues,reviewFingerprint} from '../product-integrity.js';

// Authentication is enforced for ALL project domains by Vercel Authentication.
// Origin checks are additional CSRF protection, never treated as authentication.
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  if(req.method==='POST'&&req.headers?.origin){
    try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origem não permitida.'});}
    catch{return res.status(403).json({error:'Origem inválida.'});}
  }
  const base=process.env.SUPABASE_PRODUCT_STUDIO_URL,key=process.env.PRODUCT_STUDIO_INTERNAL_KEY;
  if(!base||!key)return res.status(500).json({error:'Product Studio database connection is not configured.'});
  const url=`${base}/functions/v1/product-studio-api`,headers={'content-type':'application/json','x-studio-key':key};
  try{
    if(req.method==='POST'){
      const product=req.body?.product;
      if(!product||typeof product!=='object'||Array.isArray(product)||!product.id)return res.status(400).json({error:'Produto em falta.'});
      if(!['Draft','Ready','Live','Paused','Archived'].includes(product.status))return res.status(400).json({error:'Estado inválido.'});
      if(JSON.stringify(req.body).length>500000)return res.status(413).json({error:'Produto demasiado grande.'});
      const channel=product.getYourGuidePublication;
      const channelActive=['Ready','Submitted','In review','Published'].includes(channel?.status);
      if(['Ready','Live'].includes(product.status)||channelActive){
        const previousResponse=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
        if(!previousResponse.ok)throw new Error('Previous revision unavailable');
        const data=await previousResponse.json();
        const previous=data.products?.find(p=>p.id===product.id);
        const previousProduct=previous?unpackCompletionMetadata(previous):null;
        const unchangedLive=product.status==='Live'&&previousProduct?.status==='Live'&&reviewFingerprint(previousProduct)===reviewFingerprint(product);
        const unchangedChannel=channelActive&&previousProduct?.getYourGuidePublication?.status===channel.status&&JSON.stringify(previousProduct.getYourGuidePublication.payload)===JSON.stringify(channel.payload);
        if((['Ready','Live'].includes(product.status)&&!unchangedLive)||(channelActive&&!unchangedChannel)){
          const issues=publicationIssues(product);
          if(issues.length)return res.status(422).json({error:'Antes de Ready/publicação: '+issues.join(', '),issues});
        }
      }
    }
    const upstream=await fetch(url,{method:req.method,headers,body:req.method==='POST'?JSON.stringify({...req.body,product:packCompletionMetadata(req.body.product)}):undefined,signal:AbortSignal.timeout(20000)});
    const responseText=await upstream.text();res.status(upstream.status);res.setHeader('content-type','application/json; charset=utf-8');
    if(req.method==='GET'&&upstream.ok){const data=JSON.parse(responseText);if(Array.isArray(data.products))data.products=data.products.map(unpackCompletionMetadata);return res.json(data);}
    return res.send(responseText);
  }catch(error){console.error('Product Studio proxy failed',error?.name);return res.status(502).json({error:'Não foi possível guardar/ler na cloud. Nenhuma publicação foi confirmada.'});}
}
