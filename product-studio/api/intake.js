import { buildProductFromSource } from '../lib/product-builder.js';

async function storageAction(action, extra={}) {
  const base = process.env.SUPABASE_PRODUCT_STUDIO_URL;
  const key = process.env.PRODUCT_STUDIO_INTERNAL_KEY;
  if (!base || !key) throw new Error('Product Studio storage is not configured.');
  const r = await fetch(`${base}/functions/v1/product-studio-storage`, {
    method:'POST',
    headers:{'content-type':'application/json','x-studio-key':key},
    body:JSON.stringify({action,...extra})
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'Storage request failed');
  return data;
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  try{
    let source={...(req.body||{})};
    if(source.mode==='storage_file'){
      if(!source.storagePath) throw new Error('Caminho do ficheiro em falta.');
      const signed=await storageAction('read-url',{path:source.storagePath});
      source.fileUrl=signed.signedUrl;
    }
    const result=await buildProductFromSource(source);
    if(source.mode==='storage_file'){
      result.sourceLabel=source.fileName||source.storagePath;
      result.sourceMode='storage_file';
      result.sourceReferences=[
        ...(result.sourceReferences||[]),
        {type:'private_storage',path:source.storagePath,fileName:source.fileName||'',mimeType:source.mimeType||''}
      ];
    }
    return res.status(200).json(result);
  }catch(error){
    console.error('Product intake failed',error);
    return res.status(500).json({error:error?.message||'Não foi possível criar o produto a partir desta fonte.'});
  }
}
