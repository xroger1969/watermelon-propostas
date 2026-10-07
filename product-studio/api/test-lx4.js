import { buildProductFromSource } from '../lib/product-builder.js';

function decodeEntities(text){
  return String(text||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
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

export default async function handler(req,res){
  try{
    const url='https://lx4tours.com/tours/quad-explorer/';
    const page=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; WatermelonProductStudio/1.0)','accept':'text/html'}});
    if(!page.ok)throw new Error('source fetch '+page.status);
    const pageText=htmlToText(await page.text());
    const generated=await buildProductFromSource({mode:'url',url,resolvedUrl:url,pageText});
    return res.status(200).json({
      ok:true,
      title:generated.product.title,
      destination:generated.product.destination,
      duration:generated.product.duration,
      maxGuests:generated.product.maxGuests,
      priceType:generated.product.priceType,
      draftPrice:generated.product.suggestedPrice,
      included:generated.product.included,
      excluded:generated.product.excluded,
      meetingPoint:generated.product.meetingPoint,
      qualityScore:generated.product.qualityScore,
      marketMethod:generated.marketResearch?.method,
      marketPrice:generated.marketResearch?.recommendedPrice,
      comparables:generated.marketResearch?.pricedComparableCount,
      confidence:generated.marketResearch?.confidence
    });
  }catch(e){
    console.error(e);
    return res.status(500).json({ok:false,error:e?.message||String(e)});
  }
}
