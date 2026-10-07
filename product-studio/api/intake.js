import { buildProductFromSource } from '../lib/product-builder.js';

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  try{
    const result=await buildProductFromSource(req.body||{});
    return res.status(200).json(result);
  }catch(error){
    console.error('Product intake failed',error);
    return res.status(500).json({error:error?.message||'Não foi possível criar o produto a partir desta fonte.'});
  }
}
