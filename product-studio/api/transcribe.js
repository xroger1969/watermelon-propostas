function parseDataUrl(dataUrl){
  const m=String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/);
  if(!m) throw new Error('Áudio inválido.');
  return {mime:m[1],bytes:Buffer.from(m[2],'base64')};
}

export default async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  try{
    if(!process.env.OPENAI_API_KEY) throw new Error('OpenAI API não configurada.');
    const {mime,bytes}=parseDataUrl(req.body?.dataUrl);
    if(bytes.length>8*1024*1024) throw new Error('O áudio é demasiado grande. Usa uma gravação mais curta.');
    const ext=mime.includes('mp4')?'m4a':mime.includes('wav')?'wav':'webm';
    const form=new FormData();
    form.append('model','gpt-transcribe');
    form.append('prompt','Tourism product briefing for Watermelon Experiences in Portugal. Preserve place names, durations, prices, inclusions and exclusions accurately.');
    form.append('file',new Blob([bytes],{type:mime}),req.body?.fileName||`brief.${ext}`);
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
      body:form
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data?.error?.message||'Falha na transcrição.');
    return res.status(200).json({text:data.text||'',languages:data.languages||[]});
  }catch(error){
    console.error('Transcription failed',error);
    return res.status(500).json({error:error?.message||'Não foi possível transcrever o áudio.'});
  }
}
