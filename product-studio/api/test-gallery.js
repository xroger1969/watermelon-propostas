async function callStorage(action,extra={}){
  const r=await fetch(`${process.env.SUPABASE_PRODUCT_STUDIO_URL}/functions/v1/product-studio-storage`,{
    method:'POST',
    headers:{'content-type':'application/json','x-studio-key':process.env.PRODUCT_STUDIO_INTERNAL_KEY},
    body:JSON.stringify({action,...extra})
  });
  const d=await r.json();
  if(!r.ok)throw new Error(d.error||'storage failure');
  return d;
}
async function callProducts(method,body){
  const r=await fetch(`${process.env.SUPABASE_PRODUCT_STUDIO_URL}/functions/v1/product-studio-api`,{
    method,
    headers:{'content-type':'application/json','x-studio-key':process.env.PRODUCT_STUDIO_INTERNAL_KEY},
    body:body?JSON.stringify(body):undefined
  });
  const d=await r.json();
  if(!r.ok)throw new Error(d.error||'products failure');
  return d;
}
export default async function handler(req,res){
  let path='';
  try{
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8AARAwMDAxMDAwAAgwBAf7mFqoAAAAASUVORK5CYII=','base64');
    const file=new Blob([png],{type:'image/png'});
    const ticket=await callStorage('media-ticket',{productId:'WM-GALLERY-TEST',fileName:'test.png',mimeType:'image/png',size:file.size});
    path=ticket.path;
    const form=new FormData();
    form.append('cacheControl','3600');
    form.append('',file,'test.png');
    const up=await fetch(ticket.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:form});
    if(!up.ok)throw new Error('upload '+up.status);
    const direct=await callStorage('media-read-url',{path});
    const directFetch=await fetch(direct.signedUrl);
    if(!directFetch.ok)throw new Error('direct read '+directFetch.status);

    const product={
      id:'WM-GALLERY-TEST',status:'Draft',source:'WATERMELON',title:'Gallery persistence test',
      shortTitle:'Gallery test',destination:'Lisbon',category:'Custom Experience',duration:'1 hour',
      summary:'Temporary gallery test',description:'Temporary gallery test',highlights:'Test',
      itinerary:'Test stop',meetingPoint:'Lisbon',pickup:'',dropoff:'',included:'Test',excluded:'None',
      language:'English',groupType:'Private',maxGuests:'2',questions:'',cancellation:'Free cancellation',
      optionTitle:'Standard',optionCode:'OPT-1',priceType:'Per group',adultPrice:'100',childPrice:'',
      currency:'EUR',days:'Mon,Tue',startTimes:'09:00',capacity:'2',cutoffHours:'12',
      pricingProvider:'WATERMELON',availabilityProvider:'WATERMELON',
      gallery:[{path,name:'test.png',url:direct.signedUrl,isMain:true}]
    };
    await callProducts('POST',{product});
    const all=await callProducts('GET');
    const loaded=(all.products||[]).find(p=>p.id==='WM-GALLERY-TEST');
    if(!loaded)throw new Error('saved product not returned');
    const persisted=loaded.gallery?.[0];
    if(!persisted?.url||persisted.path!==path)throw new Error('gallery did not persist');
    const persistedFetch=await fetch(persisted.url);
    if(!persistedFetch.ok)throw new Error('persisted signed URL '+persistedFetch.status);

    await callStorage('media-delete',{path}); path='';
    return res.status(200).json({
      ok:true,
      upload:true,
      directRead:directFetch.status,
      saved:true,
      reloaded:true,
      galleryCount:loaded.gallery.length,
      mainImage:Boolean(loaded.mainImage),
      persistedRead:persistedFetch.status
    });
  }catch(e){
    if(path){try{await callStorage('media-delete',{path})}catch{}}
    console.error(e);
    return res.status(500).json({ok:false,error:e?.message||String(e)});
  }
}
