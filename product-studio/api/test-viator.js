import { draftProduct } from '../lib/product-builder.js';
export default async function handler(req,res){
  try{
    const r=await draftProduct({mode:'viator',reference:'https://www.viator.com/tours/Lisbon/Sintra-Cabo-da-Roca-and-Cascais-Private-Tour-from-Lisbon/d538-72696P1'});
    return res.status(200).json({
      ok:true,
      title:r.product.title,
      destination:r.product.destination,
      duration:r.product.duration,
      sourceMode:r.sourceMode,
      sourceLabel:r.sourceLabel,
      references:r.sourceReferences
    });
  }catch(e){console.error(e);return res.status(500).json({ok:false,error:e?.message||String(e)})}
}