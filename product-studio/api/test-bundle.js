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
    const content=`Operator programme notes
Experience: Private Sintra, Cabo da Roca and Cascais
Duration: 8 hours
Pickup: Lisbon accommodation
Maximum guests: 8
Includes: private vehicle, driver-guide, bottled water
Excludes: monument tickets, meals
Suggested stops: Pena area, Sintra historic centre, Cabo da Roca, Cascais
`;
    const file=new Blob([content],{type:'text/plain'});
    const ticket=await storage('ticket',{fileName:'bundle-test.txt',mimeType:'text/plain',size:file.size});
    path=ticket.path;
    const form=new FormData();
    form.append('cacheControl','3600');
    form.append('',file,'bundle-test.txt');
    const up=await fetch(ticket.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form});
    if(!up.ok)throw new Error('signed upload failed: '+up.status);

    const signed=await storage('read-url',{path});
    const source={
      mode:'bundle',
      brief:'Watermelon priority: keep this private and premium, maximum 8 guests, and do not include monument tickets.',
      sources:[
        {kind:'text',label:'Watermelon master note',text:'Private premium positioning. Maximum 8 guests. Keep pricing competitive and exclude monument tickets.'},
        {kind:'voice_text',label:'Voice transcript',text:'Pickup should be at the client hotel in Lisbon. Keep the day relaxed and avoid overloading the itinerary.'},
        {kind:'file',label:'Operator programme',storagePath:path,fileUrl:signed.signedUrl,fileName:'bundle-test.txt',mimeType:'text/plain',size:file.size},
        {kind:'viator',label:'Viator benchmark',url:'https://www.viator.com/tours/Lisbon/Sintra-Cabo-da-Roca-and-Cascais-Private-Tour-from-Lisbon/d538-72696P1'}
      ]
    };
    const generated=await buildProductFromSource(source);
    await storage('delete',{path}); path='';
    return res.status(200).json({
      ok:true,
      sourceMode:generated.sourceMode,
      sourceLabel:generated.sourceLabel,
      referenceCount:generated.sourceReferences?.length||0,
      title:generated.product.title,
      duration:generated.product.duration,
      maxGuests:generated.product.maxGuests,
      pickup:generated.product.pickup,
      excluded:generated.product.excluded,
      marketMethod:generated.marketResearch?.method,
      comparables:generated.marketResearch?.pricedComparableCount,
      price:generated.marketResearch?.recommendedPrice,
      confidence:generated.marketResearch?.confidence
    });
  }catch(e){
    if(path){try{await storage('delete',{path})}catch{}}
    console.error(e);
    return res.status(500).json({ok:false,error:e?.message||String(e)});
  }
}
