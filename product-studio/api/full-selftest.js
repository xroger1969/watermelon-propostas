import { buildProduct } from '../lib/product-builder.js';

export default async function handler(req,res){
  try{
    const generated=await buildProduct(
      'Create a private half-day Setubal and Arrabida scenic experience, 5 hours, up to 6 guests, pickup in Lisbon, private transport and local host included, meals and attraction tickets excluded. Keep it premium and relaxed.'
    );
    const p={
      id:'WM-SELFTEST-AI',
      status:'Draft',
      source:'WATERMELON',
      ...generated.product,
      highlights:(generated.product.highlights||[]).join('\n'),
      itinerary:(generated.product.itinerary||[]).join('\n'),
      included:(generated.product.included||[]).join('\n'),
      excluded:(generated.product.excluded||[]).join('\n'),
      days:(generated.product.days||[]).join(','),
      startTimes:(generated.product.startTimes||[]).join(', '),
      questions:(generated.product.questions||[]).join('\n'),
      adultPrice:String(generated.product.suggestedPrice ?? ''),
      childPrice:String(generated.product.childPrice ?? ''),
      pricingProvider:'WATERMELON',
      availabilityProvider:'WATERMELON',
      viatorCode:'',
      aiAssumptions:generated.product.assumptions||[],
      aiMissing:generated.product.missingInformation||[],
      aiPriceRationale:generated.product.priceRationale||'',
      aiQualityScore:generated.product.qualityScore||0,
      aiModel:generated.model,
      aiBrief:'Automated end-to-end validation product'
    };

    const upstream=await fetch(`${process.env.SUPABASE_PRODUCT_STUDIO_URL}/functions/v1/product-studio-api`,{
      method:'POST',
      headers:{'content-type':'application/json','x-studio-key':process.env.PRODUCT_STUDIO_INTERNAL_KEY},
      body:JSON.stringify({product:p})
    });
    const saved=await upstream.json();
    if(!upstream.ok) return res.status(upstream.status).json({ok:false,stage:'save',error:saved.error||'save failed'});
    return res.status(200).json({
      ok:true,
      model:generated.model,
      title:generated.product.title,
      suggestedPrice:generated.product.suggestedPrice,
      qualityScore:generated.product.qualityScore,
      saved
    });
  }catch(e){
    console.error(e);
    return res.status(500).json({ok:false,error:e?.message||String(e)});
  }
}