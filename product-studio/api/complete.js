import {completionRequest,completeProductFields} from '../lib/product-completion.js';

export const config={maxDuration:240};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  // This endpoint has the same access perimeter as the existing Studio editor.
  // Reject cross-origin browser invocations; no external write or publication occurs.
  const origin=req.headers?.origin;
  if(origin){
    try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Origem não permitida.'});}
    catch{return res.status(403).json({error:'Origem inválida.'});}
  }
  let request;
  try{
    if(JSON.stringify(req.body||{}).length>90000)throw new Error('O programa ultrapassa o tamanho permitido.');
    request=completionRequest(req.body);
  }catch(error){return res.status(400).json({error:error.message});}
  try{return res.status(200).json(await completeProductFields(request));}
  catch(error){
    console.error('Studio field completion failed',error?.code||error?.name||'Error');
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
    return res.status(timeout?504:502).json({error:timeout?
      'A pesquisa demorou demasiado. Tenta preencher apenas esta secção; os teus dados foram mantidos.':
      'Não foi possível concluir a pesquisa IA. Tenta novamente; os teus dados foram mantidos.'});
  }
}
