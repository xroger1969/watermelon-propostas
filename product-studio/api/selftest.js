export default async function handler(req, res) {
  try {
    const token = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
    if (!token) return res.status(500).json({ok:false,error:'missing_gateway_auth'});
    const response = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${token}`, 'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'openai/gpt-6.1-sol',
        input: 'Create a test title for a private Lisbon city tour. Return only the requested structured object.',
        text: { format: { type:'json_schema', name:'selftest', strict:true, schema:{
          type:'object', additionalProperties:false,
          properties:{title:{type:'string'},destination:{type:'string'}},
          required:['title','destination']
        }}}
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ok:false,error:data?.error?.message||'gateway_error'});
    let text = data.output_text;
    if (!text && Array.isArray(data.output)) {
      for (const item of data.output) {
        const part = item.content?.find?.(p => p.type === 'output_text');
        if (part?.text) { text = part.text; break; }
      }
    }
    return res.status(200).json({ok:true,model:data.model||null,structured:JSON.parse(text)});
  } catch (e) {
    return res.status(500).json({ok:false,error:e.message});
  }
}
