import fs from 'node:fs';
function edit(path,fn){const full='product-studio/'+path;let value=fs.readFileSync(full,'utf8');const r=(a,b,n=1)=>{if(value.split(a).length-1!==n)throw Error('Unexpected source: '+path+' '+a.slice(0,65));value=value.split(a).join(b);};fn(r,()=>value,v=>value=v);fs.writeFileSync(full,value);}
edit('index.html',(r)=>{
 r("${opts.includes(value)?'':'<option value=\"\" selected>Por confirmar</option>'}${opts.map(x=>`<option ${x===value?'selected':''}>${x}</option>`).join('')}","${opts.includes(value)?'':`<option value=\"${esc(value||'')}\" selected>${esc(value||'Por confirmar')}</option>`}${opts.map(x=>`<option value=\"${esc(x)}\" ${x===value?'selected':''}>${esc(x)}</option>`).join('')}");
 r("destination:'',category:'Private Tour'","destination:'',category:'Custom Experience'");
 r("language:'English',groupType:''","language:'',groupType:''");
 r("questions:'Hotel / accommodation name'","questions:''");
});
edit('integrity-editor.js',(r)=>{r('      panel.append(box);',"      const assistant=panel.querySelector('.ai-completion-bar');if(assistant)assistant.after(box);else panel.prepend(box);");});
edit('ai-completion.js',(r)=>{
 r("if(automatic)fields=fields.filter(field=>!PRICE_FIELDS.includes(field));","fields=fields.filter(field=>!PRICE_FIELDS.includes(field));");
 r("  if(completionBusy)return false;\n  syncForm();","  if(completionBusy)return false;\n  syncForm();\n  if(PRICE_FIELDS.includes(scope)){currentStep=4;renderWizard();toast('Consulta e aprova o preço nesta etapa.');return false;}");
 r("button.textContent='✦ Preencher com IA';button.setAttribute","button.textContent=PRICE_FIELDS.includes(name)?'Rever preço':'✦ Preencher com IA';button.setAttribute");
});
edit('product-integrity.js',(r,g,s)=>{
 const start=g().indexOf('  const money='),end=g().indexOf('  const unique=',start);
 if(start<0||end<0)throw Error('Money parser bounds');
 const parser=String.raw`  const money=/(?:€|EUR|\$|USD|£|GBP)\s*(\d[\d.,\u00a0 ]*\d|\d)|(\d[\d.,\u00a0 ]*\d|\d)\s*(?:€|EUR|\$|USD|£|GBP)/gi;
  const amounts=[...s.matchAll(money)].map(m=>{
    let n=(m[1]||m[2]).replace(/[\s\u00a0]/g,'');
    if(/[.,]\d{1,2}$/.test(n)){const at=Math.max(n.lastIndexOf(','),n.lastIndexOf('.'));n=n.slice(0,at).replace(/[.,]/g,'')+'.'+n.slice(at+1);}
    else n=n.replace(/[.,]/g,'');
    return Number(n);
  });
`;
 s(g().slice(0,start)+parser+g().slice(end));
 r("  const issues=validateSellingPrice(p),s=safetyState(p);","  const issues=validateSellingPrice(p),s=safetyState(p);\n  if(!(p.gallery||[]).some(g=>g.path||g.url))issues.push('imagem principal do operador');");
});
edit('completion-fields.js',(r)=>{
 r('  return packed;','  if(Array.isArray(product.allOptions))packed.allOptions=product.allOptions.map(o=>o.optionCode===product.optionCode?{...o,...Object.fromEntries([\'optionTitle\',\'adultPrice\',\'childPrice\',\'priceType\',\'currency\'].filter(f=>product[f]!==undefined).map(f=>[f,product[f]]))}:o);\n  return packed;');
});
console.log('Studio integrity polish applied.');
