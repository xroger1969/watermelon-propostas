export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  const base=process.env.SUPABASE_PRODUCT_STUDIO_URL;
  const key=process.env.PRODUCT_STUDIO_INTERNAL_KEY;
  if(!base||!key)return res.status(500).json({error:'Product Studio storage is not configured.'});
  try{
    const upstream=await fetch(`${base}/functions/v1/product-studio-storage`,{
      method:'POST',
      headers:{'content-type':'application/json','x-studio-key':key},
      body:JSON.stringify({
        action:'ticket',
        fileName:req.body?.fileName,
        mimeType:req.body?.mimeType,
        size:req.body?.size
      })
    });
    const text=await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type','application/json; charset=utf-8');
    return res.send(text);
  }catch(error){
    console.error('Upload ticket failed',error);
    return res.status(502).json({error:'Não foi possível preparar o upload privado.'});
  }
}
