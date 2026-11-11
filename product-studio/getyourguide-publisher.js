
function gygSelectedForPreparation(product){return window.gygPreparationPolicy?.gygSelected(product)===true;}
function gygAccountIssues(product,payload){return window.gygPreparationPolicy?.gygPreparationIssues(product,payload)||['A carregar regras da conta GetYourGuide'];}
function gygPriceLabel(value){return typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(value):'Por confirmar';}

const GYG_STATUS_ORDER = ["Not prepared","Ready","Submitted","In review","Published","Changes requested","Rejected","Paused","Archived"];

function gygLines(value){
  if(Array.isArray(value)) return value.map(String).map(x=>x.trim()).filter(Boolean);
  return String(value||"").split(/\r?\n|\s*,\s*/).map(x=>x.trim()).filter(Boolean);
}

function gygPublication(product){
  if(!product.getYourGuidePublication){
    product.getYourGuidePublication={
      status:"Not prepared",
      externalProductId:"",
      payload:null,
      notes:"",
      preparedAt:null,
      submittedAt:null,
      publishedAt:null,
      lastSyncedAt:null
    };
  }
  return product.getYourGuidePublication;
}

function gygCategory(product){
  const map={
    "Private Tour":"Private Tour",
    "Day Trip":"Day Trip",
    "Walking Tour":"Walking Tour",
    "Food & Drink":"Food & Drink",
    "Boat Tour":"Boat Tour",
    "Transfer":"Transfer",
    "Attraction":"Attraction",
    "Custom Experience":"Other Experience"
  };
  return map[product.category]||"Other Experience";
}

function gygTitle(product){
  const title=String(product.title||"").trim();
  const destination=String(product.destination||"").split(",")[0].trim();
  if(!title) return "";
  if(!destination) return title;
  if(title.toLowerCase().includes(destination.toLowerCase())) return title;
  return destination+": "+title;
}

function gygHighlights(product){
  const verbs=/^(see|visit|enjoy|experience|explore|discover|travel|ride|taste|learn|admire|relax|sail|walk|cook|watch|create|cross|take|meet)\b/i;
  const result=[];
  const add=(text,prefix="Discover")=>{
    const clean=String(text||"").replace(/^[-•\d.)\s]+/,"").trim();
    if(!clean) return;
    const value=verbs.test(clean)?clean:(prefix+" "+clean.charAt(0).toLowerCase()+clean.slice(1));
    if(!result.some(x=>x.toLowerCase()===value.toLowerCase())) result.push(value);
  };
  gygLines(product.highlights).forEach(x=>add(x));
  gygLines(product.itinerary).forEach(x=>{ if(result.length<5) add(x,"Visit"); });
  if(result.length<3 && product.destination) add("the character and scenery of "+product.destination,"Explore");
  if(result.length<3 && product.groupType==="Private") add("a private experience reserved for your group","Enjoy");
  if(result.length<3 && product.pickup) add("a smoother start with the pickup arrangement described in the activity","Enjoy");
  return result.slice(0,5);
}

function gygKeywords(product){
  const stop=new Set(["the","and","with","from","tour","private","experience","full","half","day","in","of","to","a","an"]);
  const source=[product.destination,product.category,product.title]
    .filter(Boolean).join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9\s-]/g," ")
    .toLowerCase().split(/\s+/)
    .filter(x=>x.length>2&&!stop.has(x));
  return [...new Set(source)].slice(0,12);
}

function gygOptions(product){
  const options=Array.isArray(product.allOptions)&&product.allOptions.length
    ? product.allOptions
    : [{
        optionCode:product.optionCode||"DEFAULT",
        optionTitle:product.optionTitle||"Standard",
        optionDescription:"",
        priceType:product.priceType||"",
        currency:product.currency||"EUR",
        adultPrice:product.adultPrice||"",
        childPrice:product.childPrice||"",
        startTimes:gygLines(product.startTimes),
        activeDays:gygLines(product.days),
        capacity:Number(product.capacity||product.maxGuests||8),
        cutoffHours:product.cutoffHours==null||product.cutoffHours===""?null:Number(product.cutoffHours)
      }];
  const prepared=options.map(o=>({
    referenceCode:o.optionCode||"DEFAULT",
    title:o.optionTitle||"Standard",
    description:o.optionDescription||"",
    priceType:o.priceType||"",
    currency:o.currency||"EUR",
    adultPrice:o.adultPrice===""?null:Number(o.adultPrice),
    childPrice:o.childPrice===""?null:Number(o.childPrice),
    activeDays:Array.isArray(o.activeDays)?o.activeDays:gygLines(o.activeDays),
    startTimes:Array.isArray(o.startTimes)?o.startTimes:gygLines(o.startTimes),
    capacity:Number(o.capacity||product.maxGuests||8),
    bookingCutoffHours:o.cutoffHours==null||o.cutoffHours===""?null:Number(o.cutoffHours),
    availabilityMode:"Fixed time slots"
  }));
  if(gygSelectedForPreparation(product)){
    const main=prepared.find(o=>o.referenceCode===product.optionCode)||prepared[0];
    return main?[window.gygPreparationPolicy.gygProposalOption(product,main)]:[];
  }
  return prepared;
}

function buildGygPayload(product){
  const gallery=typeof galleryOf==="function"?galleryOf(product):[];
  const photos=gallery.map((m,index)=>({
    url:m.url||"",
    storagePath:m.path||"",
    fileName:m.name||("image-"+(index+1)+".jpg"),
    main:index===0,
    source:m.source||"watermelon",
    sourcePhotoId:m.sourcePhotoId||undefined,
    width:m.width??undefined,
    height:m.height??undefined
  })).filter(x=>x.url||x.storagePath);
  if(!photos.length && !gygSelectedForPreparation(product) && product.viatorSnapshot?.image){
    photos.push({
      url:product.viatorSnapshot.image,
      storagePath:"",
      fileName:"viator-existing-image.jpg",
      main:true,
      source:"existing-watermelon-viator-listing"
    });
  }

  const description=String(product.description||"").trim();
  const summary=String(product.summary||"").trim() || description.split(/(?<=[.!?])\s+/).slice(0,2).join(" ");
  const questions=gygLines(product.questions);

  return {
    provider:"getyourguide",
    preparedFrom:"Watermelon Product Studio",
    preparedAt:new Date().toISOString(),
    creationLanguage:"English",
    productCategory:gygCategory(product),
    productReferenceCode:product.id,
    title:gygTitle(product),
    shortDescription:summary,
    fullDescription:description,
    highlights:gygHighlights(product),
    locations:product.destination?[product.destination]:[],
    keywords:gygKeywords(product),
    inclusions:gygLines(product.included),
    exclusions:gygLines(product.excluded),
    notAllowed:[],
    knowBeforeYouGo:questions.map(q=>"Please provide: "+q),
    voucherInformation:"",
    itinerary:gygLines(product.itinerary),
    meetingPoint:String(product.meetingPoint||"").trim(),
    pickup:String(product.pickup||"").trim(),
    dropoff:String(product.dropoff||"").trim(),
    languages:[product.language||"English"],
    groupType:product.groupType||"Private",
    maxGuests:gygSelectedForPreparation(product)?2:Number(product.maxGuests||product.capacity||8),
    cancellationPolicy:String(product.cancellation||"").trim(),
    photos,
    options:gygOptions(product),
    sourceMappings:{
      watermelonProductId:product.id,
      viatorProductCode:product.viatorCode||"",
      viatorUrl:product.viatorSnapshot?.url||""
    },
    commercialContact:"info@watermelonexperiences.pt"
  };
}

function gygReadiness(product,payload){
  const missing=[...gygAccountIssues(product,payload),...(typeof window.studioPublicationIssues==='function'?window.studioPublicationIssues(product):['commercial review required'])];
  const warnings=[];
  if(!payload.title) missing.push("title");
  if(!payload.shortDescription) missing.push("short description");
  if(!payload.fullDescription) missing.push("full description");
  if(payload.highlights.length<3) missing.push("3–5 highlights");
  if(!payload.locations.length) missing.push("location");
  if(!payload.photos.length) missing.push("photos");
  if(!payload.meetingPoint&&!payload.pickup) missing.push("meeting point or pickup");
  if(!payload.cancellationPolicy) warnings.push("cancellation policy");
  if(!payload.inclusions.length) warnings.push("inclusions");
  if(!payload.exclusions.length) warnings.push("exclusions");
  if(!payload.itinerary.length) warnings.push("visual itinerary");
  const options=payload.options||[];
  if(!options.length) missing.push("product option");
  if(options.length&&!options.some(o=>Number(o.adultPrice)>0)) missing.push("price");
  if(options.length&&!options.some(o=>Array.isArray(o.startTimes)&&o.startTimes.length)) missing.push("start time / availability");
  return {ready:missing.length===0,missing,warnings};
}

function gygStatusClass(status){
  if(status==="Published") return "live";
  if(status==="Ready"||status==="Submitted"||status==="In review") return "ready";
  if(status==="Changes requested"||status==="Paused") return "paused";
  if(status==="Rejected"||status==="Archived") return "archived";
  return "draft";
}

function gygStatusBadge(status){
  return '<span class="badge '+gygStatusClass(status)+'"><i class="dot"></i>'+esc(status)+'</span>';
}

function gygProductCompleteness(product){
  const payload=buildGygPayload(product);
  const r=gygReadiness(product,payload);
  const required=8;
  return Math.max(0,Math.round(((required-Math.min(required,r.missing.length))/required)*100));
}

async function persistGygProduct(product){
  const i=products.findIndex(p=>p.id===product.id);
  if(i>=0) products[i]=product;
  save();
  return saveCloud(product);
}

async function prepareGygProduct(id,silent=false){
  const product=products.find(p=>p.id===id);
  if(!product) return;
  if(!gygSelectedForPreparation(product)){if(!silent)toast("Este programa está fora do lote selecionado.");return;}
  const pub=gygPublication(product);
  const payload=buildGygPayload(product);
  if(pub.payload?.publicUrl)payload.publicUrl=pub.payload.publicUrl;
  const readiness=gygReadiness(product,payload);
  const protectedStatuses=["Submitted","In review","Published","Changes requested","Rejected","Paused"];
  if(!protectedStatuses.includes(pub.status)){
    pub.status=readiness.ready?"Ready":"Not prepared";
  }
  pub.payload=payload;
  pub.preparedAt=new Date().toISOString();
  const previousNotes=String(pub.notes||" ").split("\n\n[Verificação GYG]")[0].trim();
  const checks=[
    readiness.missing.length?"Missing: "+readiness.missing.join(", "):"",
    readiness.warnings.length?"Review: "+readiness.warnings.join(", "):""
  ].filter(Boolean).join(" · ");
  pub.notes=[previousNotes,"[Verificação GYG] "+checks].filter(Boolean).join("\n\n");
  try{
    await persistGygProduct(product);
    if(!silent) toast(readiness.ready?"GetYourGuide package ready ✓":"Package prepared — some fields still need confirmation");
  }catch(e){
    if(!silent) toast("Prepared locally; cloud save failed");
    console.error(e);
  }
  renderGetYourGuide();
  return {product,payload,readiness};
}

async function prepareAllGetYourGuide(){
  const candidates=products.filter(p=>p.status!=="Archived"&&gygSelectedForPreparation(p));
  if(!candidates.length){toast("No products to prepare");return}
  const btn=document.querySelector("#gygPrepareAll");
  if(btn){btn.disabled=true;btn.textContent="Preparing…"}
  let done=0;
  for(const product of candidates){
    await prepareGygProduct(product.id,true);
    done++;
    if(btn) btn.textContent="Preparing "+done+"/"+candidates.length;
  }
  if(btn){btn.disabled=false;btn.textContent="Preparar selecionados"}
  toast("GetYourGuide packages prepared: "+done);
  renderGetYourGuide();
}

async function setGygStatus(id,status){
  const product=products.find(p=>p.id===id);
  if(!product) return;
  if(['Ready','Submitted','In review','Published'].includes(status)){const issues=gygReadiness(product,buildGygPayload(product)).missing;if(issues.length){toast('Ainda falta: '+issues.join(', '));renderGetYourGuide();return;}}
  const pub=gygPublication(product);
  const publicUrl=pub.payload?.publicUrl;
  pub.payload=buildGygPayload(product);
  if(publicUrl)pub.payload.publicUrl=publicUrl;
  const now=new Date().toISOString();
  if(status==="Published"){
    const readiness=gygReadiness(product,buildGygPayload(product));
    if(readiness.missing.length){
      toast("Completa primeiro: "+readiness.missing.slice(0,3).join(", "));
      renderGetYourGuide();return;
    }
    const confirmedId=window.prompt("ID verdadeiro do produto GetYourGuide",pub.externalProductId||"");
    if(confirmedId===null||!confirmedId.trim()){toast("É obrigatório o ID confirmado no Supplier Portal");renderGetYourGuide();return}
    const url=window.prompt("URL público oficial do produto GetYourGuide",pub.payload.publicUrl||"");
    if(url===null||!url.trim()){toast("É obrigatório o URL público do produto");renderGetYourGuide();return}
    try{
      const u=new URL(url.trim());
      if(u.protocol!=="https:"||!(u.hostname==="getyourguide.com"||u.hostname.endsWith(".getyourguide.com")))
        throw new Error("Domínio não autorizado");
    }catch(e){toast("Utiliza apenas um endereço oficial HTTPS da GetYourGuide");renderGetYourGuide();return}
    if(!window.confirm("Confirmas que este programa já foi publicado e validado no Supplier Portal?")){renderGetYourGuide();return}
    pub.externalProductId=confirmedId.trim();
    pub.payload.publicUrl=url.trim();
  }
  pub.status=status;
  if(status==="Ready"&&!pub.preparedAt) pub.preparedAt=now;
  if(["Submitted","In review","Published"].includes(status)&&!pub.submittedAt) pub.submittedAt=now;
  if(status==="Published"&&!pub.publishedAt) pub.publishedAt=now;
  try{
    await persistGygProduct(product);
    toast("GetYourGuide status: "+status);
  }catch(e){
    console.error(e);toast("Status saved locally; cloud save failed");
  }
  renderGetYourGuide();
}

function gygPackText(payload){
  const lines=[];
  const section=(title,value)=>{
    lines.push("\n"+title.toUpperCase());
    if(Array.isArray(value)) lines.push(value.length?value.map(x=>"• "+(typeof x==="string"?x:JSON.stringify(x))).join("\n"):"—");
    else lines.push(value||"—");
  };
  lines.push("GETYOURGUIDE SUBMISSION PACK");
  lines.push("Reference: "+(payload.productReferenceCode||""));
  lines.push("Creation language: "+payload.creationLanguage);
  lines.push("Category: "+payload.productCategory);
  section("Title",payload.title);
  section("Short description",payload.shortDescription);
  section("Full description",payload.fullDescription);
  section("Highlights",payload.highlights);
  section("Locations",payload.locations);
  section("Keywords",payload.keywords);
  section("Included",payload.inclusions);
  section("Not included",payload.exclusions);
  section("Know before you go",payload.knowBeforeYouGo);
  section("Itinerary",payload.itinerary);
  section("Meeting point",payload.meetingPoint);
  section("Pickup",payload.pickup);
  section("Drop-off",payload.dropoff);
  section("Languages",payload.languages);
  section("Cancellation",payload.cancellationPolicy);
  section("Options",payload.options.map(o=>o.title+" | "+o.priceType+" | "+(o.pricingTiers?.length?o.pricingTiers.map(t=>t.minParticipants+" participant(s): "+t.pricePerPerson+" "+o.currency+" per person; total "+t.totalPrice+" "+o.currency).join(" / "):(o.adultPrice??"price pending")+" "+o.currency)+" | "+(o.startTimes||[]).join(", ")+" | "+(o.activeDays||[]).join(", ")));
  section("Photos",payload.photos.map(p=>p.url||p.storagePath||p.fileName));
  return lines.join("\n");
}

async function copyGygText(text,label){
  try{
    await navigator.clipboard.writeText(String(text||""));
    toast((label||"Field")+" copied");
  }catch(e){
    console.error(e);toast("Could not copy");
  }
}

function openGygPack(id){
  const product=products.find(p=>p.id===id);
  if(!product) return;
  const pub=gygPublication(product);
  const payload=buildGygPayload(product);
  const r=gygReadiness(product,payload);
  const list=(arr)=>arr?.length?'<ul>'+arr.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':'<p class="hint">None</p>';
  const options=(payload.options||[]).map(o=>'<div class="gyg-option"><b>'+esc(o.title)+'</b><span>'+esc(o.priceType)+' · '+(o.adultPrice==null?'price pending':esc(o.adultPrice+" "+o.currency))+'</span>'+(o.pricingTiers||[]).map(t=>'<span>'+t.minParticipants+' pessoa(s): '+esc(gygPriceLabel(t.pricePerPerson))+' por pessoa · total '+esc(gygPriceLabel(t.totalPrice))+'</span>').join('')+'<span>'+esc((o.startTimes||[]).join(", ")||"Horários por confirmar")+'</span></div>').join("");
  const photos=(payload.photos||[]).map(p=>p.url?'<img src="'+esc(p.url)+'" alt="">':'<span class="chip">'+esc(p.fileName||"photo")+'</span>').join("");
  showModal(
    '<div class="gyg-pack-head"><div><p class="eyebrow">GETYOURGUIDE PACKAGE</p><h3>'+esc(payload.title||product.title)+'</h3><p class="hint">'+esc(payload.productReferenceCode)+'</p></div>'+gygStatusBadge(pub.status)+'</div>'+
    (r.missing.length?'<div class="notice"><b>Still required before submission:</b> '+esc(r.missing.join(", "))+'</div>':'<div class="gyg-ready-box"><b>Pacote estruturado. A elegibilidade e operação direta carecem de validação.</b></div>')+
    (typeof gygScreenProduct==='function'?'<div class="notice"><b>Pré-triagem GetYourGuide:</b> '+esc(gygScreenProduct(product).short)+' '+esc(gygScreenProduct(product).next)+'</div>':'')+
    '<div class="gyg-copy-grid">'+
      gygFieldBlock("Title",payload.title)+
      gygFieldBlock("Short description",payload.shortDescription)+
      gygFieldBlock("Full description",payload.fullDescription,true)+
      gygFieldBlock("Meeting point",payload.meetingPoint)+
      gygFieldBlock("Pickup",payload.pickup)+
      gygFieldBlock("Cancellation",payload.cancellationPolicy)+
    '</div>'+
    '<div class="gyg-pack-section"><div class="section-head"><div><h2>Highlights</h2><p>GetYourGuide recommends 3–5 concise highlights starting with a verb.</p></div></div>'+list(payload.highlights)+'</div>'+
    '<div class="gyg-pack-section"><h2>Keywords</h2>'+list(payload.keywords)+'</div>'+
    '<div class="gyg-pack-section gyg-two"><div><h2>Included</h2>'+list(payload.inclusions)+'</div><div><h2>Not included</h2>'+list(payload.exclusions)+'</div></div>'+
    '<div class="gyg-pack-section"><h2>Itinerary</h2>'+list(payload.itinerary)+'</div>'+
    '<div class="gyg-pack-section"><h2>Options, price & availability</h2><div class="gyg-options">'+options+'</div></div>'+
    '<div class="gyg-pack-section"><h2>Photos</h2><div class="gyg-photo-row">'+photos+'</div></div>'+
    '<div class="gyg-pack-actions"><button class="btn" onclick="copyGygPackage(\''+esc(product.id)+'\')">Copy complete pack</button><button class="btn" onclick="downloadGygPackage(\''+esc(product.id)+'\')">Download JSON</button><a class="btn primary" href="https://supplier.getyourguide.com/home" target="_blank" rel="noopener">Open GetYourGuide Supplier →</a></div>',
    [{label:"Close",action:"closeModal()"}]
  );
  const box=document.querySelector("#modal .box");if(box)box.style.maxWidth="980px";
}

function gygFieldBlock(label,value,wide=false){
  const safe=esc(value||"");
  return '<div class="gyg-field '+(wide?"wide":"")+'"><div><b>'+esc(label)+'</b><button class="iconbtn" onclick="copyGygText(this.closest(\'.gyg-field\').querySelector(\'textarea\').value,\''+esc(label)+'\')">Copy</button></div><textarea readonly>'+safe+'</textarea></div>';
}

function copyGygPackage(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const payload=buildGygPayload(p);
  copyGygText(gygPackText(payload),"Complete package");
}

function downloadGygPackage(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const payload=buildGygPayload(p);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=(p.id||"watermelon")+"-getyourguide.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportAllGetYourGuide(){
  const payload=products.filter(gygSelectedForPreparation).map(p=>({
    watermelonProductId:p.id,
    status:gygPublication(p).status,
    externalProductId:gygPublication(p).externalProductId||"",
    package:buildGygPayload(p)
  }));
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),provider:"getyourguide",products:payload},null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="watermelon-getyourguide-publisher.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function filterGygProducts(){
  const q=(document.querySelector("#gygQ")?.value||"").toLowerCase();
  const s=document.querySelector("#gygStatus")?.value||"";
  const scope=document.querySelector("#gygScope")?.value||"selected";
  renderGygTable(products.filter(p=>{
    const pub=gygPublication(p);
    const hay=[p.title,p.destination,p.id,p.viatorCode,pub.externalProductId].join(" ").toLowerCase();
    return (scope!=="selected"||gygSelectedForPreparation(p))&&(!q||hay.includes(q))&&(!s||pub.status===s);
  }));
}

function renderGygTable(list){
  const area=document.querySelector("#gygTableArea");if(!area)return;
  if(!list.length){area.innerHTML='<div class="card empty">No products match this filter.</div>';return}
  area.innerHTML='<div class="card table-wrap"><table class="table gyg-table"><thead><tr><th>Product</th><th>Source</th><th>Package</th><th>GYG status</th><th>Needs attention</th><th></th></tr></thead><tbody>'+
    [...list].sort((a,b)=>Number(gygSelectedForPreparation(b))-Number(gygSelectedForPreparation(a))).map(p=>{
      const pub=gygPublication(p);
      const payload=buildGygPayload(p);
      const r=gygReadiness(p,payload);
      const completeness=gygProductCompleteness(p);
      return '<tr>'+
        '<td><b>'+esc(p.title||"Untitled")+'</b><br><span class="hint">'+esc(p.id)+' · '+esc(p.destination||"—")+'</span></td>'+
        '<td>'+(p.viatorCode?'<span class="badge">Viator '+esc(p.viatorCode)+'</span>':'<span class="badge">Watermelon</span>')+'</td>'+
        '<td><div class="kpi-line"><span>'+completeness+'%</span><span class="progress"><i style="width:'+completeness+'%"></i></span></div></td>'+
        '<td>'+gygStatusBadge(pub.status)+(pub.externalProductId?'<br><span class="hint">ID '+esc(pub.externalProductId)+'</span>':'')+'</td>'+
        '<td>'+(r.missing.length?'<span class="gyg-missing">'+esc(r.missing.slice(0,3).join(", "))+(r.missing.length>3?'…':'')+'</span>':'<span class="gyg-ok">Ready</span>')+'</td>'+
        '<td><div class="row-actions gyg-actions">'+
          '<button class="iconbtn" '+(gygSelectedForPreparation(p)?'':'disabled ')+'onclick="prepareGygProduct(\''+esc(p.id)+'\')">Preparar</button>'+
          '<button class="iconbtn" onclick="openGygPack(\''+esc(p.id)+'\')">View pack</button>'+
          '<select class="gyg-state-select" onchange="setGygStatus(\''+esc(p.id)+'\',this.value)">'+
            GYG_STATUS_ORDER.map(s=>'<option '+(s===pub.status?'selected':'')+'>'+esc(s)+'</option>').join("")+
          '</select>'+
        '</div></td>'+
      '</tr>';
    }).join("")+
  '</tbody></table></div>';
}

function gygSelectionHtml(){
  const selected=products.filter(gygSelectedForPreparation);
  if(!selected.length)return '<section class="card gyg-selection"><h2>Programas selecionados</h2><p>A seleção ainda não foi carregada. Os restantes produtos continuam no catálogo.</p></section>';
  return '<section class="card gyg-selection"><h2>'+selected.length+' programas selecionados para preparação</h2><p>Uma pessoa paga o mesmo total de duas. Os valores abaixo são a proposta para a GetYourGuide; a submissão é feita após a revisão final.</p><div class="gyg-selection-grid">'+selected.map(p=>{
    const prep=window.gygPreparationPolicy.gygPreparation(p),price=prep.pricing||{},count=window.gygPreparationPolicy.gygPhotoCount(p);
    const issues=gygReadiness(p,buildGygPayload(p)).missing;
    return '<article class="gyg-selected-product"><h3>'+esc(p.title)+'</h3><p class="hint">'+esc(p.id)+'</p><dl class="gyg-selected-prices"><div><dt>1 pessoa · total</dt><dd>'+esc(gygPriceLabel(price.solo))+'</dd></div><div><dt>2 pessoas · por pessoa</dt><dd>'+esc(gygPriceLabel(price.perPerson))+'</dd></div></dl><p class="hint">Total para 2: '+esc(gygPriceLabel(typeof price.perPerson==='number'?price.perPerson*2:null))+' · '+count+'/7 fotografias</p>'+
      (price.source==='website_promotion'?'<p class="hint">Acompanha a promoção do site. Sem promoção: '+esc(gygPriceLabel(typeof price.basePerPerson==='number'?price.basePerPerson*2:null))+' sozinho / '+esc(gygPriceLabel(price.basePerPerson))+' por pessoa com 2.</p>':'')+
      (issues.length?'<p class="gyg-selected-state">Em preparação</p><ul class="gyg-selected-gaps">'+issues.slice(0,4).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+(issues.length>4?'<details><summary>Ver restantes verificações ('+(issues.length-4)+')</summary><ul class="gyg-selected-gaps">'+issues.slice(4).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details>':''):'<p class="gyg-ok">Ficha completa para revisão final</p>')+
      '<div class="actions"><button class="btn" onclick="editProduct(\''+esc(p.id)+'\')">Editar ficha</button><button class="btn primary" onclick="openGygPack(\''+esc(p.id)+'\')">Ver preparação</button></div></article>';
  }).join('')+'</div><p class="hint">'+(products.length-selected.length)+' outros programas fora deste lote. Escalões para 3 ou mais pessoas ainda por confirmar na GetYourGuide.</p></section>';
}

function renderGetYourGuide(){
  const el=document.querySelector("#gygView");if(!el)return;
  const pubs=products.map(p=>gygPublication(p));
  const ready=pubs.filter(x=>x.status==="Ready").length;
  const pipeline=pubs.filter(x=>["Submitted","In review","Changes requested"].includes(x.status)).length;
  const published=pubs.filter(x=>x.status==="Published").length;
  el.innerHTML=
    '<div class="topbar"><div><h1>Preparação GetYourGuide</h1><p>Conta 831862 · Watermelon Experiences</p></div><div class="actions"><button id="gygPrepareAll" class="btn green" onclick="prepareAllGetYourGuide()">Preparar selecionados</button><button class="btn" onclick="exportAllGetYourGuide()">Exportar selecionados</button><a class="btn primary" href="https://supplier.getyourguide.com/home" target="_blank" rel="noopener">Abrir Supplier Portal →</a></div></div>'+
    gygSelectionHtml()+
    '<details class="gyg-more"><summary>Mais opções · catálogo e integração</summary>'+
    '<div class="grid4"><div class="metric"><div class="label">Products</div><div class="value">'+products.length+'</div><div class="sub">Watermelon master catalogue</div></div><div class="metric"><div class="label">Ready</div><div class="value">'+ready+'</div><div class="sub">pacote estruturado, sujeito a triagem</div></div><div class="metric"><div class="label">Submitted / review</div><div class="value">'+pipeline+'</div><div class="sub">GetYourGuide pipeline</div></div><div class="metric"><div class="label">Published</div><div class="value">'+published+'</div><div class="sub">live on GetYourGuide</div></div></div>'+
    '<div class="card gyg-intro"><div><b>Connection prepared — activation pending</b><p>The Studio is already prepared for GetYourGuide. Products can be structured, reviewed and tracked here now. Live API catalogue access remains inactive until GetYourGuide partner credentials and published tour IDs are available.</p></div><div class="notice"><b>Professional status:</b> Until a product is Published and has a public GetYourGuide booking URL, the website shows the channel as <b>Not yet available</b>. Once the URL is saved here, the website can expose the GetYourGuide booking option automatically.</div></div>'+
    '<div id="gygIntegrationHub"></div>'+
    '<div id="gygEligibilityAudit"></div>'+
    '<div class="toolbar gyg-toolbar"><select id="gygScope" class="search" style="max-width:210px" onchange="filterGygProducts()"><option value="selected">Selecionados para preparar</option><option value="all">Todos os programas</option></select><input id="gygQ" class="search" placeholder="Search title, destination or code…" oninput="filterGygProducts()"><select id="gygStatus" class="search" style="max-width:210px" onchange="filterGygProducts()"><option value="">All GetYourGuide statuses</option>'+GYG_STATUS_ORDER.map(s=>'<option>'+esc(s)+'</option>').join("")+'</select></div>'+
    '<div id="gygTableArea"></div></details>';
  renderGygTable(products.filter(gygSelectedForPreparation));
  if(typeof renderGygIntegrationHub==="function")renderGygIntegrationHub();
  if(typeof renderGygEligibilityAudit==="function")renderGygEligibilityAudit();
}

window.renderGetYourGuide=renderGetYourGuide;
window.prepareGygProduct=prepareGygProduct;
window.prepareAllGetYourGuide=prepareAllGetYourGuide;
window.openGygPack=openGygPack;
window.copyGygText=copyGygText;
window.copyGygPackage=copyGygPackage;
window.downloadGygPackage=downloadGygPackage;
window.exportAllGetYourGuide=exportAllGetYourGuide;
window.setGygStatus=setGygStatus;
window.filterGygProducts=filterGygProducts;
