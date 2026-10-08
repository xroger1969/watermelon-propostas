
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
        priceType:product.priceType||"Per group",
        currency:product.currency||"EUR",
        adultPrice:product.adultPrice||"",
        childPrice:product.childPrice||"",
        startTimes:gygLines(product.startTimes),
        activeDays:gygLines(product.days),
        capacity:Number(product.capacity||product.maxGuests||8),
        cutoffHours:Number(product.cutoffHours||12)
      }];
  return options.map(o=>({
    referenceCode:o.optionCode||"DEFAULT",
    title:o.optionTitle||"Standard",
    description:o.optionDescription||"",
    priceType:o.priceType||"Per group",
    currency:o.currency||"EUR",
    adultPrice:o.adultPrice===""?null:Number(o.adultPrice),
    childPrice:o.childPrice===""?null:Number(o.childPrice),
    activeDays:Array.isArray(o.activeDays)?o.activeDays:gygLines(o.activeDays),
    startTimes:Array.isArray(o.startTimes)?o.startTimes:gygLines(o.startTimes),
    capacity:Number(o.capacity||product.maxGuests||8),
    bookingCutoffHours:Number(o.cutoffHours??12),
    availabilityMode:"Fixed time slots"
  }));
}

function buildGygPayload(product){
  const gallery=typeof galleryOf==="function"?galleryOf(product):[];
  const photos=gallery.map((m,index)=>({
    url:m.url||"",
    storagePath:m.path||"",
    fileName:m.name||("image-"+(index+1)+".jpg"),
    main:index===0,
    source:"watermelon"
  })).filter(x=>x.url||x.storagePath);
  if(!photos.length && product.viatorSnapshot?.image){
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
    maxGuests:Number(product.maxGuests||product.capacity||8),
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
  const missing=[];
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
  const pub=gygPublication(product);
  const payload=buildGygPayload(product);
  const readiness=gygReadiness(product,payload);
  const protectedStatuses=["Submitted","In review","Published","Changes requested","Rejected","Paused"];
  if(!protectedStatuses.includes(pub.status)){
    pub.status=readiness.ready?"Ready":"Not prepared";
  }
  pub.payload=payload;
  pub.preparedAt=new Date().toISOString();
  pub.notes=[
    readiness.missing.length?"Missing: "+readiness.missing.join(", "):"",
    readiness.warnings.length?"Review: "+readiness.warnings.join(", "):""
  ].filter(Boolean).join(" · ");
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
  const candidates=products.filter(p=>p.status!=="Archived");
  if(!candidates.length){toast("No products to prepare");return}
  const btn=document.querySelector("#gygPrepareAll");
  if(btn){btn.disabled=true;btn.textContent="Preparing…"}
  let done=0;
  for(const product of candidates){
    await prepareGygProduct(product.id,true);
    done++;
    if(btn) btn.textContent="Preparing "+done+"/"+candidates.length;
  }
  if(btn){btn.disabled=false;btn.textContent="Prepare all products"}
  toast("GetYourGuide packages prepared: "+done);
  renderGetYourGuide();
}

async function setGygStatus(id,status){
  const product=products.find(p=>p.id===id);
  if(!product) return;
  const pub=gygPublication(product);
  if(!pub.payload) pub.payload=buildGygPayload(product);
  const now=new Date().toISOString();
  pub.status=status;
  if(status==="Ready"&&!pub.preparedAt) pub.preparedAt=now;
  if(["Submitted","In review","Published"].includes(status)&&!pub.submittedAt) pub.submittedAt=now;
  if(status==="Published"&&!pub.publishedAt) pub.publishedAt=now;
  if(status==="Published"){
    if(!pub.externalProductId){
      const value=window.prompt("GetYourGuide product ID (optional — you can add it later)","");
      if(value!==null) pub.externalProductId=value.trim();
    }
    if(!pub.payload) pub.payload=buildGygPayload(product);
    const existingUrl=String(pub.payload.publicUrl||"");
    const url=window.prompt("Public GetYourGuide booking URL",existingUrl);
    if(url!==null) pub.payload.publicUrl=url.trim();
    if(!String(pub.payload.publicUrl||"").trim()){
      pub.notes=[pub.notes,"Published status set, but public GetYourGuide URL is still missing."].filter(Boolean).join(" · ");
    }
  }
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
  section("Options",payload.options.map(o=>o.title+" | "+(o.adultPrice??"price pending")+" "+o.currency+" | "+(o.startTimes||[]).join(", ")+" | "+(o.activeDays||[]).join(", ")));
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
  const payload=pub.payload||buildGygPayload(product);
  const r=gygReadiness(product,payload);
  const list=(arr)=>arr?.length?'<ul>'+arr.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':'<p class="hint">None</p>';
  const options=(payload.options||[]).map(o=>'<div class="gyg-option"><b>'+esc(o.title)+'</b><span>'+esc(o.priceType)+' · '+(o.adultPrice==null?'price pending':esc(o.adultPrice+" "+o.currency))+'</span><span>'+esc((o.startTimes||[]).join(", ")||"times pending")+'</span></div>').join("");
  const photos=(payload.photos||[]).map(p=>p.url?'<img src="'+esc(p.url)+'" alt="">':'<span class="chip">'+esc(p.fileName||"photo")+'</span>').join("");
  showModal(
    '<div class="gyg-pack-head"><div><p class="eyebrow">GETYOURGUIDE PACKAGE</p><h3>'+esc(payload.title||product.title)+'</h3><p class="hint">'+esc(payload.productReferenceCode)+'</p></div>'+gygStatusBadge(pub.status)+'</div>'+
    (r.missing.length?'<div class="notice"><b>Still required before submission:</b> '+esc(r.missing.join(", "))+'</div>':'<div class="gyg-ready-box"><b>Package structurally ready for Supplier Portal.</b></div>')+
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
  const payload=gygPublication(p).payload||buildGygPayload(p);
  copyGygText(gygPackText(payload),"Complete package");
}

function downloadGygPackage(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const payload=gygPublication(p).payload||buildGygPayload(p);
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=(p.id||"watermelon")+"-getyourguide.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportAllGetYourGuide(){
  const payload=products.map(p=>({
    watermelonProductId:p.id,
    status:gygPublication(p).status,
    externalProductId:gygPublication(p).externalProductId||"",
    package:gygPublication(p).payload||buildGygPayload(p)
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
  renderGygTable(products.filter(p=>{
    const pub=gygPublication(p);
    const hay=[p.title,p.destination,p.id,p.viatorCode,pub.externalProductId].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!s||pub.status===s);
  }));
}

function renderGygTable(list){
  const area=document.querySelector("#gygTableArea");if(!area)return;
  if(!list.length){area.innerHTML='<div class="card empty">No products match this filter.</div>';return}
  area.innerHTML='<div class="card table-wrap"><table class="table gyg-table"><thead><tr><th>Product</th><th>Source</th><th>Package</th><th>GYG status</th><th>Needs attention</th><th></th></tr></thead><tbody>'+
    list.map(p=>{
      const pub=gygPublication(p);
      const payload=pub.payload||buildGygPayload(p);
      const r=gygReadiness(p,payload);
      const completeness=gygProductCompleteness(p);
      return '<tr>'+
        '<td><b>'+esc(p.title||"Untitled")+'</b><br><span class="hint">'+esc(p.id)+' · '+esc(p.destination||"—")+'</span></td>'+
        '<td>'+(p.viatorCode?'<span class="badge">Viator '+esc(p.viatorCode)+'</span>':'<span class="badge">Watermelon</span>')+'</td>'+
        '<td><div class="kpi-line"><span>'+completeness+'%</span><span class="progress"><i style="width:'+completeness+'%"></i></span></div></td>'+
        '<td>'+gygStatusBadge(pub.status)+(pub.externalProductId?'<br><span class="hint">ID '+esc(pub.externalProductId)+'</span>':'')+'</td>'+
        '<td>'+(r.missing.length?'<span class="gyg-missing">'+esc(r.missing.slice(0,3).join(", "))+(r.missing.length>3?'…':'')+'</span>':'<span class="gyg-ok">Ready</span>')+'</td>'+
        '<td><div class="row-actions gyg-actions">'+
          '<button class="iconbtn" onclick="prepareGygProduct(\''+esc(p.id)+'\')">Prepare</button>'+
          '<button class="iconbtn" onclick="openGygPack(\''+esc(p.id)+'\')">View pack</button>'+
          '<select class="gyg-state-select" onchange="setGygStatus(\''+esc(p.id)+'\',this.value)">'+
            GYG_STATUS_ORDER.map(s=>'<option '+(s===pub.status?'selected':'')+'>'+esc(s)+'</option>').join("")+
          '</select>'+
        '</div></td>'+
      '</tr>';
    }).join("")+
  '</tbody></table></div>';
}

function renderGetYourGuide(){
  const el=document.querySelector("#gygView");if(!el)return;
  const pubs=products.map(p=>gygPublication(p));
  const ready=pubs.filter(x=>x.status==="Ready").length;
  const pipeline=pubs.filter(x=>["Submitted","In review","Changes requested"].includes(x.status)).length;
  const published=pubs.filter(x=>x.status==="Published").length;
  el.innerHTML=
    '<div class="topbar"><div><h1>GetYourGuide Publisher</h1><p>Prepare the Supplier Portal package from the Watermelon master catalogue.</p></div><div class="actions"><button id="gygPrepareAll" class="btn green" onclick="prepareAllGetYourGuide()">Prepare all products</button><button class="btn" onclick="exportAllGetYourGuide()">Export all JSON</button><a class="btn primary" href="https://supplier.getyourguide.com/home" target="_blank" rel="noopener">Open Supplier Portal →</a></div></div>'+
    '<div class="grid4"><div class="metric"><div class="label">Products</div><div class="value">'+products.length+'</div><div class="sub">Watermelon master catalogue</div></div><div class="metric"><div class="label">Ready</div><div class="value">'+ready+'</div><div class="sub">prepared for submission</div></div><div class="metric"><div class="label">Submitted / review</div><div class="value">'+pipeline+'</div><div class="sub">GetYourGuide pipeline</div></div><div class="metric"><div class="label">Published</div><div class="value">'+published+'</div><div class="sub">live on GetYourGuide</div></div></div>'+
    '<div class="card gyg-intro"><div><b>Connection prepared — activation pending</b><p>The Studio is already prepared for GetYourGuide. Products can be structured, reviewed and tracked here now. Live API catalogue access remains inactive until GetYourGuide partner credentials and published tour IDs are available.</p></div><div class="notice"><b>Professional status:</b> Until a product is Published and has a public GetYourGuide booking URL, the website shows the channel as <b>Not yet available</b>. Once the URL is saved here, the website can expose the GetYourGuide booking option automatically.</div></div>'+
    '<div class="toolbar gyg-toolbar"><input id="gygQ" class="search" placeholder="Search title, destination or code…" oninput="filterGygProducts()"><select id="gygStatus" class="search" style="max-width:210px" onchange="filterGygProducts()"><option value="">All GetYourGuide statuses</option>'+GYG_STATUS_ORDER.map(s=>'<option>'+esc(s)+'</option>').join("")+'</select></div>'+
    '<div id="gygTableArea"></div>';
  renderGygTable(products);
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
