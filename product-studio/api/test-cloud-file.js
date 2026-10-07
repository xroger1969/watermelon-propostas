import { buildProductFromSource } from '../lib/product-builder.js';

async function storage(action, extra={}) {
  const r=await fetch(`${process.env.SUPABASE_PRODUCT_STUDIO_URL}/functions/v1/product-studio-storage`,{
    method:'POST',
    headers:{'content-type':'application/json','x-studio-key':process.env.PRODUCT_STUDIO_INTERNAL_KEY},
    body:JSON.stringify({action,...extra})
  });
  const d=await r.json();
  if(!r.ok)throw new Error(d.error||'storage failure');
  return d;
}

export default async function handler(req,res){
  let path='';
  try{
    const content=`Watermelon test source document
Experience: Private Setubal, Arrabida and Azeitao
Duration: 7 hours
Pickup: Lisbon hotel
Maximum guests: 8
Includes: private transportation, driver-guide, bottled water
Excludes: lunch, winery tasting fees, attraction tickets
Suggested route: Setubal market, Arrabida viewpoints, Azeitao village
Positioning: premium private day experience
`;
    const file=new Blob([content],{type:'text/plain'});
    const ticket=await storage('ticket',{fileName:'test-program.txt',mimeType:'text/plain',size:file.size});
    path=ticket.path;
    const form=new FormData();
    form.append('cacheControl','3600');
    form.append('',file,'test-program.txt');
    const up=await fetch(ticket.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form});
    if(!up.ok)throw new Error('signed upload failed: '+up.status);
    const read=await storage('read-url',{path});
    const generated=await buildProductFromSource({
      mode:'storage_file',
      fileUrl:read.signedUrl,
      storagePath:path,
      fileName:'test-program.txt',
      mimeType:'text/plain',
      brief:'Create an original Watermelon product from this source.'
    });
    await storage('delete',{path});
    path='';
    return res.status(200).json({
      ok:true,
      upload:true,
      privateUrl:true,
      model:generated.model,
      title:generated.product.title,
      destination:generated.product.destination,
      duration:generated.product.duration,
      marketMethod:generated.marketResearch?.method,
      price:generated.marketResearch?.recommendedPrice,
      comparables:generated.marketResearch?.pricedComparableCount,
      confidence:generated.marketResearch?.confidence
    });
  }catch(e){
    if(path){try{await storage('delete',{path})}catch{}}
    console.error(e);
    return res.status(500).json({ok:false,error:e?.message||String(e)});
  }
}
