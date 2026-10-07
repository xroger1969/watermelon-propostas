import { buildProductFromSource } from '../lib/product-builder.js';
export default async function handler(req,res){
  try{
    const r=await buildProductFromSource({mode:'text',brief:'Private full-day Sintra, Cabo da Roca and Cascais experience from Lisbon, 8 hours, hotel pickup, private vehicle and guide, maximum 8 guests, monument tickets and meals excluded. Premium but competitive positioning.'});
    return res.status(200).json({
      ok:true,
      title:r.product.title,
      price:r.product.suggestedPrice,
      currency:r.product.currency,
      market:r.marketResearch
    });
  }catch(e){console.error(e);return res.status(500).json({ok:false,error:e?.message||String(e)})}
}