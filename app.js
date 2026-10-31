(function(){
"use strict";
var F = window.FlectPurchase;
var API = window.FlectAPI;
var CFG = window.FLECT_CONFIG || {};
var ADMIN_USER = String(CFG.adminUsername || "flect_stars").replace(/^@/, "");
var TGW = window.Telegram && window.Telegram.WebApp;
var TG = TGW && TGW.platform && TGW.platform !== "unknown" ? TGW : null;
var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function esc(t){return String(t==null?"":t).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function sum(p){return F.formatPrice(p)+" so'm"}
function haptic(kind){try{
  if(TG&&TG.HapticFeedback){kind==="sel"?TG.HapticFeedback.selectionChanged():kind==="ok"?TG.HapticFeedback.notificationOccurred("success"):kind==="err"?TG.HapticFeedback.notificationOccurred("error"):TG.HapticFeedback.impactOccurred(kind||"light")}
  else if(navigator.vibrate){navigator.vibrate(kind==="sel"?6:12)}}catch(e){}}
function fmtDate(s){var d=new Date(s);if(isNaN(d))return "";function p(n){return(n<10?"0":"")+n}
  return p(d.getDate())+"."+p(d.getMonth()+1)+"."+d.getFullYear()+" "+p(d.getHours())+":"+p(d.getMinutes())}

/* ---- Xizmatlar (bo'limlar). Mahsulotlar va narxlar bazadan keladi. ---- */
var SERVICES=[
  {id:"stars",title:"Telegram Stars",desc:"Yulduzlar sotib oling",ico:"i-star",g:"g-gold"},
  {id:"premium",title:"Telegram Premium",desc:"Premium obunani faollashtiring",ico:"i-dia",g:"g-prem"},
  {id:"accounts",title:"Telegram Akkauntlar",desc:"O'zbekiston raqamli akkauntlar",ico:"i-user",g:"g-acc"},
  {id:"gifts",title:"Telegram Gifts",desc:"Kolleksiya uchun sovg'alar",ico:"i-gift",g:"g-gift"},
  {id:"nft",title:"NFT / Kolleksiyalar",desc:"Kolleksiya buyumlari",ico:"i-img",g:"g-nft"}
];
var SVC={};SERVICES.forEach(function(s){SVC[s.id]=s});

/* ---- Holat ---- */
var CAT={loaded:false,loading:false,error:null,items:[]};
var ME={loaded:false,loading:false,error:null,data:null};
var ORD={loaded:false,loading:false,error:null,items:[]};
var busy={};

function byCat(c){return CAT.items.filter(function(p){return p.category===c})}
function byId(id){for(var i=0;i<CAT.items.length;i++)if(CAT.items[i].id===id)return CAT.items[i];return null}
function hasSale(c){return byCat(c).some(function(p){return p.is_active})}

function loadCatalog(){
  if(CAT.loading)return;
  CAT.loading=true;CAT.error=null;
  API.products().then(function(rows){CAT.items=rows;CAT.loaded=true},function(e){CAT.error=e})
    .then(function(){CAT.loading=false;rerender(["home","services","stars","premium","gifts","accounts","nft"])});
}
function loadMe(){
  if(!API.inTelegram()||ME.loading)return;
  ME.loading=true;ME.error=null;
  API.me().then(function(d){ME.data=d;ME.loaded=true},function(e){ME.error=e})
    .then(function(){ME.loading=false;rerender(["home","profile"])});
}
function loadOrders(){
  if(!API.inTelegram()||ORD.loading)return;
  ORD.loading=true;ORD.error=null;rerender(["orders"]);
  API.myOrders(50,0).then(function(d){ORD.items=d.orders;ORD.loaded=true},function(e){ORD.error=e})
    .then(function(){ORD.loading=false;rerender(["orders"])});
}

/* ---- Shablon bo'laklari ---- */
function ico(id,g,lg){return '<span class="ico '+g+(lg?' lg':'')+'"><svg><use href="#'+id+'"/></svg></span>'}
function hdrSub(title){return '<header class="hdr"><button class="round" data-back aria-label="Orqaga"><svg><use href="#u-back"/></svg></button><h1>'+title+'</h1><button class="round" data-go="help" aria-label="Yordam"><svg><use href="#n-help"/></svg></button></header>'}
function hdrTab(title,right){return '<header class="hdr"><h1 style="font-size:28px;font-weight:800">'+title+'</h1>'+(right||"")+'</header>'}
function intro(s,sub){return '<div class="intro glass">'+ico(s.ico,s.g,true)+'<div><b>'+s.title+'</b><small>'+sub+'</small></div></div>'}
function skel(n,h){var s="";for(var i=0;i<n;i++)s+='<div class="skel glass" style="height:'+(h||74)+'px"></div>';return '<div class="list" aria-busy="true">'+s+'</div>'}
function errBox(e,retry){return '<div class="empty glass"><b>Yuklab bo\'lmadi</b><p>'+esc(e&&e.message||"Xatolik yuz berdi.")+'</p><button class="buy blue" data-retry="'+retry+'">Qayta urinish</button></div>'}
function catalogGate(){if(CAT.error)return errBox(CAT.error,"catalog");if(!CAT.loaded)return skel(4);return null}
function buyBtn(p,cls){
  if(!p.is_active)return '<button class="'+cls+' off" disabled>Sotuvda yo\'q</button>';
  return '<button class="'+cls+(busy[p.id]?' loading':'')+'" data-buy="'+esc(p.id)+'"'+(busy[p.id]?' disabled':'')+'>Sotib olish</button>';
}
function qty(p){var m=String(p.title).match(/\d+/);return m?parseInt(m[0],10):0}
// Rasm: https:// havola yoki sayt ichidagi img/ papka; aks holda emoji
function artHtml(p){
  if(p.image&&/^(https:\/\/|img\/[a-z0-9\/_-]+\.(webp|png|jpe?g|svg)$)/i.test(p.image))return '<img src="'+esc(p.image)+'" alt="" loading="lazy" decoding="async">';
  return esc(p.image||"🎁");
}

var V={};
V.home=function(){
  var tiles=SERVICES.slice(0,4).map(function(s){return '<button class="tile glass" data-go="'+s.id+'">'+ico(s.ico,s.g)+'<span><b>'+s.title+'</b><small>'+s.desc+'</small></span></button>'}).join("");
  var st=ME.data&&ME.data.stats, open=st?(st.pending||0)+(st.processing||0):0;
  var pop=CAT.loaded?CAT.items.filter(function(p){return p.is_popular&&p.is_active}).slice(0,4).map(prodRow).join(""):"";
  return '<header class="hdr"><div class="brand">'+ico("i-star","g-brand")+'<div><b>FLECT</b><small>Telegram xizmatlari barchasi bir joyda</small></div></div>'+
    '<button class="round" data-go="services" data-focus="1" aria-label="Qidirish"><svg><use href="#u-search"/></svg></button>'+
    '<button class="round'+(open?' dot':'')+'" data-go="orders" aria-label="Buyurtmalarim'+(open?(", "+open+" ta faol"):"")+'"><svg><use href="#n-orders"/></svg></button></header>'+
    '<section class="hero glass"><div class="sphere" aria-hidden="true"><svg><use href="#i-plane"/></svg></div>'+
    '<h2>Telegram xizmatlari — barchasi bir joyda</h2><p>Stars, Premium, Gifts va boshqa xizmatlarni qulay narxda xarid qiling.</p>'+
    '<button class="cta" data-go="services">Xizmatlarni ko\'rish <svg><use href="#u-arrow"/></svg></button></section>'+
    '<div class="trust"><div class="glass"><i><svg><use href="#u-check"/></svg></i>Aniq narxlar</div><div class="glass"><i><svg><use href="#n-user"/></svg></i>Admin orqali yordam</div><div class="glass"><i><svg><use href="#u-bolt"/></svg></i>Tez va ishonchli</div></div>'+
    '<div class="sec-h"><h2>Xizmatlar</h2><button class="link" data-go="services">Barchasi <svg width="14" height="14"><use href="#u-chev"/></svg></button></div>'+
    '<div class="tiles">'+tiles+'</div>'+
    (CAT.error?errBox(CAT.error,"catalog"):!CAT.loaded?'<div class="sec-h"><h2>Ommabop</h2></div>'+skel(2):pop?'<div class="sec-h"><h2>Ommabop</h2></div><div class="list">'+pop+'</div>':"");
};
V.services=function(){
  return hdrTab("Xizmatlar")+'<label class="search glass"><svg><use href="#u-search"/></svg><input id="q" type="search" placeholder="Xizmat yoki mahsulot qidirish..." autocomplete="off" aria-label="Qidirish"></label>'+
    '<div class="list" id="svc">'+svcRows("")+'</div>';
};
function svcRows(q){
  q=q.trim().toLowerCase();
  var r=SERVICES.filter(function(s){
    if(!q)return true;
    if((s.title+" "+s.desc).toLowerCase().indexOf(q)>-1)return true;
    return byCat(s.id).some(function(p){return (p.title+" "+p.message_name).toLowerCase().indexOf(q)>-1});
  });
  if(!r.length)return '<div class="empty glass"><b>Hech narsa topilmadi</b><p>Boshqa so\'z bilan qidirib ko\'ring.</p></div>';
  return r.map(function(s){
    var soon=CAT.loaded&&!hasSale(s.id);
    return '<button class="row glass'+(soon?' dim':'')+'" data-go="'+s.id+'">'+ico(s.ico,s.g)+
    '<span class="tx"><b>'+s.title+(soon?' <span class="badge soon">'+(byCat(s.id).length?"Sotuvda yo'q":"Tez orada")+'</span>':'')+'</b><small>'+s.desc+'</small></span><svg class="chev"><use href="#u-chev"/></svg></button>'}).join("");
}
// Umumiy mahsulot qatori (Stars ko'rinishi, boshqa toifalar uchun ham ishlaydi)
function prodRow(p){
  var s=SVC[p.category]||SERVICES[0], n=qty(p), star=p.category==="stars"&&n;
  return '<div class="pkg glass'+(p.is_popular?' hot':'')+(p.is_active?'':' dim')+'">'+ico(s.ico,s.g)+
    '<div class="q"><b>'+(star?n:esc(p.title))+'</b><small>'+(star?"Stars":esc(p.subtitle||s.title))+'</small></div>'+
    '<div class="pr">'+sum(p.price_uzs)+(p.price_is_from?"dan":"")+(p.is_popular?'<br><span class="badge pop">Ommabop</span>':'')+'</div>'+
    buyBtn(p,'buy')+'</div>';
}
var starFilter="all";
V.stars=function(){
  var s=SVC.stars, g=catalogGate();
  return hdrSub(s.title)+intro(s,"Kerakli miqdorni tanlang va admin orqali xarid qiling.")+(g||
    '<div class="chips" role="group" aria-label="Saralash">'+[["all","Barchasi"],["hot","Ommabop"],["big","Katta paketlar"]].map(function(c){return '<button class="chip" data-sf="'+c[0]+'" aria-pressed="'+(starFilter===c[0])+'">'+c[1]+'</button>'}).join("")+'</div>'+
    '<div class="list" id="starlist">'+starRows()+'</div>');
};
function starRows(){
  var r=byCat("stars").filter(function(p){return starFilter==="all"||(starFilter==="hot"?p.is_popular:qty(p)>=150)});
  return r.length?r.map(prodRow).join(""):'<div class="empty glass"><b>Paketlar yo\'q</b><p>Hozircha bu toifada paket yo\'q.</p></div>';
}
V.premium=function(){
  var s=SVC.premium, g=catalogGate(), list=byCat("premium");
  return hdrSub(s.title)+intro(s,"Obuna muddatini tanlang.")+(g||(list.length?'<div class="list">'+list.map(function(p){
    return '<div class="prem glass'+(p.is_popular?' hot':'')+(p.is_active?'':' dim')+'"><div class="top"><b><i><svg><use href="#i-crown"/></svg></i>'+esc(p.title)+'</b><span>'+sum(p.price_uzs)+(p.price_is_from?"dan":"")+'</span></div>'+
      '<div class="bot"><small>'+esc(p.subtitle||p.message_name)+(p.is_popular?' · <span class="badge pop">Ommabop</span>':'')+'</small>'+buyBtn(p,'buy blue')+'</div></div>'}).join("")+'</div>'
    :'<div class="empty glass"><b>Tez orada</b><p>Premium paketlar hali qo\'shilmagan.</p></div>'));
};
var giftFilter="all";
V.gifts=function(){
  var s=SVC.gifts, g=catalogGate();
  return hdrSub(s.title)+intro(s,"Kolleksiya uchun noyob sovg'alar.")+(g||
    '<div class="chips" role="group" aria-label="Stars bo\'yicha">'+[["all","Barchasi"],["s25","15–25 Stars"],["s50","50 Stars"],["s100","100 Stars"]].map(function(c){return '<button class="chip" data-gf="'+c[0]+'" aria-pressed="'+(giftFilter===c[0])+'">'+c[1]+'</button>'}).join("")+'</div>'+
    '<div class="gifts" id="giftgrid">'+giftCards()+'</div>');
};
function giftStars(p){var m=String(p.subtitle||"").match(/(\d+)\s*Stars/i);return m?parseInt(m[1],10):0}
function giftCards(){
  var r=byCat("gifts").filter(function(p){
    if(giftFilter==="all")return true;
    var s=giftStars(p);
    if(giftFilter==="s25")return s>0&&s<=25;
    if(giftFilter==="s50")return s===50;
    if(giftFilter==="s100")return s>=100;
    return (p.tags||[]).indexOf(giftFilter)>-1;
  });
  if(!r.length)return '<div class="empty glass" style="grid-column:1/-1"><b>Sovg\'alar yo\'q</b><p>Bu bo\'limda hozircha sovg\'a yo\'q.</p></div>';
  return r.map(function(p){
    var st=giftStars(p);
    var inner='<span class="art" aria-hidden="true">'+artHtml(p)+'</span><b>'+esc(p.title)+'</b>'+(st?'<span class="gstar"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.85 6 6.6.82-4.88 4.55 1.28 6.53L12 17.3l-5.85 3.2 1.28-6.53L2.55 9.42l6.6-.82z"/></svg>'+st+'</span>':'')+'<small>'+(p.is_active?sum(p.price_uzs):"Sotuvda yo'q")+'</small>';
    return p.is_active?'<button class="gift glass'+(busy[p.id]?' loading':'')+'" data-buy="'+esc(p.id)+'">'+inner+'</button>':'<div class="gift glass dim">'+inner+'</div>';
  }).join("");
}
V.accounts=function(){
  var s=SVC.accounts, g=catalogGate(), list=byCat("accounts");
  return hdrSub(s.title)+intro(s,"O'zbekiston raqamli akkauntlar.")+(g||(list.length?'<div class="list">'+list.map(prodRow).join("")+'</div>':'<div class="empty glass"><b>Tez orada</b><p>Akkauntlar hozircha mavjud emas.</p></div>'))+
    '<details class="glass"><summary>Qoidalar</summary><p>Faqat qonuniy ravishda o\'tkazilishi mumkin bo\'lgan akkauntlar sotiladi. Mavjudlik va aniq narxni admin tasdiqlaydi.</p></details>';
};
V.nft=function(){
  var g=catalogGate(), list=byCat("nft");
  if(g)return hdrSub("NFT / Kolleksiyalar")+g;
  if(list.length)return hdrSub("NFT / Kolleksiyalar")+intro(SVC.nft,"Kolleksiya buyumlari.")+'<div class="list">'+list.map(prodRow).join("")+'</div>';
  return hdrSub("NFT / Kolleksiyalar")+'<div class="empty glass">'+ico("i-img","g-nft",true)+'<b>Tez orada</b><p>Bu bo\'lim tayyorlanmoqda. Savollar bo\'lsa, admin bilan bog\'laning.</p><button class="buy blue" data-go="help">Admin bilan bog\'lanish</button></div>';
};

/* ---- Buyurtmalarim ---- */
var STATUS={pending:"Kutilmoqda",processing:"Jarayonda",completed:"Bajarildi",cancelled:"Bekor qilindi"};
function orderCard(o){
  var pay=o.status==="cancelled"?"":(o.payment_confirmed?'<small class="pay ok">To\'lov tasdiqlandi</small>':'<small class="pay">To\'lov hali tasdiqlanmagan</small>');
  return '<div class="ord glass"><div class="ord-top"><span class="code">'+esc(o.code)+'</span><span class="st st-'+esc(o.status)+'">'+(STATUS[o.status]||esc(o.status))+'</span></div>'+
    '<b class="ord-title">'+esc(o.quantity>1?o.quantity+" × "+o.product_title:o.product_title)+'</b>'+
    '<div class="ord-meta"><span>'+sum(o.total_price)+'</span><span>'+fmtDate(o.created_at)+'</span></div>'+pay+
    (o.status==="cancelled"&&o.cancel_reason?'<small class="reason">Sabab: '+esc(o.cancel_reason)+'</small>':'')+'</div>';
}
V.orders=function(){
  var refresh=API.inTelegram()?'<button class="round" data-retry="orders" aria-label="Yangilash"'+(ORD.loading?' disabled':'')+'><svg'+(ORD.loading?' class="spin"':'')+'><use href="#u-refresh"/></svg></button>':"";
  var h=hdrTab("Buyurtmalar",refresh);
  if(!API.inTelegram())return h+'<div class="empty glass">'+ico("n-orders","g-brand",true).replace('<svg>','<svg style="color:#fff">')+'<b>Telegram ichida oching</b><p>Buyurtmalaringiz Telegram akkauntingizga bog\'langan. Ilovani bot orqali oching.</p></div>';
  if(ORD.error&&!ORD.loaded)return h+errBox(ORD.error,"orders");
  if(!ORD.loaded)return h+skel(3,118);
  if(!ORD.items.length)return h+'<div class="empty glass">'+ico("n-orders","g-brand",true).replace('<svg>','<svg style="color:#fff">')+
    '<b>Hozircha buyurtmalar yo\'q</b><p>Xarid qilganingizdan so\'ng buyurtmalaringiz shu yerda ko\'rinadi.</p><button class="buy blue" data-go="services">Xizmatlarni ko\'rish</button></div>';
  return h+'<div class="list">'+ORD.items.map(orderCard).join("")+'</div><p class="note">Xabar yuborish to\'lov hisoblanmaydi. To\'lovni admin tasdiqlaydi.</p>';
};

var FAQ=[["To'lovdan keyin nima bo'ladi?","Admin to'lovni tekshiradi va buyurtmangizni bajaradi. Holati Buyurtmalar bo'limida yangilanadi."],
  ["Qanday to'lov usullari mavjud?","Mavjud to'lov usullarini admin xarid paytida aytadi."],
  ["Buyurtmam qancha vaqtda bajariladi?","Muddat xizmat turiga bog'liq. Aniq vaqtni admin bilan yozishmada bilib olasiz."],
  ["Buyurtma holatini qanday tekshiraman?","Buyurtmalar bo'limini oching. Holat o'zgarganda bot ham xabar beradi (agar botga /start bosgan bo'lsangiz)."]];
V.help=function(){
  return hdrTab("Yordam")+'<div class="admin glass">'+ico("i-plane","g-brand",true).replace('<svg>','<svg style="color:#fff">')+
    '<div class="tx"><b>Admin bilan bog\'lanish</b><small>@'+esc(ADMIN_USER)+'</small></div><a class="buy blue" href="https://t.me/'+esc(ADMIN_USER)+'" target="_blank" rel="noopener" data-tglink>Yozish</a></div>'+
    '<div class="sec-h"><h2>Ko\'p beriladigan savollar</h2></div><div class="list">'+FAQ.map(function(f){return '<details class="glass"><summary>'+f[0]+'</summary><p>'+f[1]+'</p></details>'}).join("")+'</div>';
};
var ACCENTS=[["ocean","Ocean","#2f8cff","#20d2f2"],["emerald","Emerald","#13c08a","#3ee6c4"],["sunset","Sunset","#ff7a2f","#ffb547"],["purple","Purple","#7b5cff","#c06bff"],["rose","Rose","#ff4f8b","#ff8fb8"]];
V.profile=function(){
  var u=ME.data&&ME.data.user||(TG&&TG.initDataUnsafe&&TG.initDataUnsafe.user)||null;
  var name=u?[u.first_name,u.last_name].filter(Boolean).join(" "):"Mehmon",
      sub=u?(u.username?"@"+u.username:"Telegram foydalanuvchisi"):"Ilovani Telegram ichida oching",
      av=u&&u.photo_url&&/^https:\/\//.test(u.photo_url)?'<img src="'+esc(u.photo_url)+'" alt="">':esc(name.charAt(0));
  var cur=document.documentElement.getAttribute("data-accent")||"ocean";
  var st=ME.data&&ME.data.stats, stats="";
  if(st){
    stats='<div class="stats"><div class="glass"><b>'+st.orders_total+'</b><small>Jami buyurtmalar</small></div><div class="glass"><b>'+st.completed+'</b><small>Bajarilgan</small></div></div>';
    if(st.purchased&&st.purchased.length)stats+='<div class="sec-h"><h2>Xarid qilinganlar</h2></div><div class="glass bought">'+st.purchased.map(function(x){return '<div><span>'+esc(x.title)+'</span><b>'+x.count+'</b></div>'}).join("")+'</div>';
  }else if(ME.loading||(API.inTelegram()&&!ME.loaded&&!ME.error)){stats='<div class="stats"><div class="skel glass" style="height:84px"></div><div class="skel glass" style="height:84px"></div></div>'}
  else if(ME.error){stats=errBox(ME.error,"me")}
  var adminRow=ME.data&&ME.data.is_admin?'<a class="row glass" href="admin.html">'+ico("u-shield","g-brand").replace('<svg>','<svg style="color:#fff">')+'<span class="tx"><b>Admin panel</b><small>Buyurtmalar, mahsulotlar, statistika</small></span><svg class="chev"><use href="#u-chev"/></svg></a>':"";
  return hdrTab("Profil")+'<div class="me glass"><div class="ava">'+av+'</div><div><b>'+esc(name)+'</b><small>'+esc(sub)+'</small></div></div>'+stats+adminRow+
    '<div class="sec-h"><h2>Rang varianti</h2></div><div class="swatches glass" role="group" aria-label="Rang varianti">'+ACCENTS.map(function(a){
      return '<button class="sw" data-accent="'+a[0]+'" aria-pressed="'+(cur===a[0])+'"><i style="background:linear-gradient(145deg,'+a[3]+','+a[2]+')"><svg><use href="#i-plane"/></svg></i>'+a[1]+'</button>'}).join("")+'</div>'+
    '<button class="row glass" data-go="help">'+ico("n-help","g-brand").replace('<svg>','<svg style="color:#fff">')+'<span class="tx"><b>Yordam markazi</b><small>Savollar va admin aloqasi</small></span><svg class="chev"><use href="#u-chev"/></svg></button>';
};

/* ---- Navigatsiya ---- */
var TABS=["home","services","orders","help","profile"];
var PARENT={stars:"services",premium:"services",gifts:"services",accounts:"services",nft:"services"};
var route="home", stack=[];
var app=$("#app");
function render(anim){
  var y=window.scrollY;
  app.innerHTML='<div class="view'+(anim?' enter':'')+'">'+V[route]()+'</div>';
  if(!anim)window.scrollTo(0,y);
}
function rerender(routes){ if(routes.indexOf(route)>-1){var q=$("#q"),qv=q&&q.value;render(false);if(qv){q=$("#q");q.value=qv;$("#svc").innerHTML=svcRows(qv)}} }
function show(r,opts){
  opts=opts||{};
  if(!V[r])r="home";
  if(!opts.back&&r!==route){ if(PARENT[r]||!TABS.includes(route)) stack.push(route); else stack=[]; }
  if(TABS.indexOf(r)>-1&&!opts.back) stack=[];
  route=r;
  render(true);
  window.scrollTo(0,0);
  dockTo(TABS.indexOf(r)>-1?r:(PARENT[r]||"services"));
  if(TG&&TG.BackButton){ PARENT[r]?TG.BackButton.show():TG.BackButton.hide(); }
  if(opts.focus){var q=$("#q");if(q)setTimeout(function(){q.focus()},350);}
  if(r==="orders"&&API.inTelegram()&&!ORD.loading)loadOrders();
  if(r==="profile"&&API.inTelegram()&&!ME.loading)loadMe();
}
function back(){ var p=stack.pop(); show(p||PARENT[route]||"home",{back:true}); }

/* ---- Xarid: buyurtma bazaga yoziladi, keyin admin chati ochiladi ---- */
function openChat(link){
  try{ if(TG&&TG.openTelegramLink){TG.openTelegramLink(link);return true} }catch(e){}
  var w=window.open(link,"_blank");return !!w;
}
function buy(id){
  var p=byId(id);
  if(!p||!p.is_active||busy[id])return;
  haptic("medium");
  if(!API.inTelegram()){
    // Telegram tashqarisida foydalanuvchini tasdiqlab bo'lmaydi: buyurtma saqlanmaydi, faqat chat ochiladi.
    var msg="Assalomu alaykum, menga "+p.message_name+" kerak! Narxi: "+F.formatPrice(p.price_uzs)+" so'm.";
    openChat("https://t.me/"+ADMIN_USER+"?text="+encodeURIComponent(msg));
    return toast("Buyurtma faqat Telegram ichida saqlanadi");
  }
  busy[id]=true;rerender([route]);
  API.createOrder(id).then(function(res){
    haptic("ok");
    ORD.loaded=false;ME.loaded=false;
    var opened=openChat(res.link);
    toast("Buyurtma "+res.order.code+" saqlandi",opened?"Chatni ochish":"Chatni ochish",function(){openChat(res.link)},6000);
    loadMe();
  },function(e){
    haptic("err");
    toast(e.message||"Buyurtma saqlanmadi");
    if(e.code==="product_unavailable")loadCatalog();
  }).then(function(){delete busy[id];rerender([route])});
}

app.addEventListener("click",function(e){
  var t=e.target.closest("[data-go],[data-back],[data-buy],[data-sf],[data-gf],[data-accent],[data-retry],[data-tglink]");
  if(!t)return;
  if(t.hasAttribute("data-back")){haptic();return back();}
  if(t.hasAttribute("data-buy")){e.preventDefault();return buy(t.getAttribute("data-buy"));}
  if(t.hasAttribute("data-go")){haptic();return show(t.getAttribute("data-go"),{focus:t.hasAttribute("data-focus")});}
  if(t.hasAttribute("data-retry")){var w=t.getAttribute("data-retry");haptic();if(w==="catalog"){CAT.error=null;rerender([route]);loadCatalog()}else if(w==="orders")loadOrders();else if(w==="me"){ME.error=null;loadMe();rerender(["profile"])}return;}
  if(t.hasAttribute("data-sf")){starFilter=t.getAttribute("data-sf");$$("[data-sf]").forEach(function(c){c.setAttribute("aria-pressed",c===t)});$("#starlist").innerHTML=starRows();return haptic("sel");}
  if(t.hasAttribute("data-gf")){giftFilter=t.getAttribute("data-gf");$$("[data-gf]").forEach(function(c){c.setAttribute("aria-pressed",c===t)});$("#giftgrid").innerHTML=giftCards();return haptic("sel");}
  if(t.hasAttribute("data-accent")){setAccent(t.getAttribute("data-accent"));$$("[data-accent]",app).forEach(function(c){c.setAttribute("aria-pressed",c===t)});return haptic("sel");}
  if(t.hasAttribute("data-tglink")&&TG&&TG.openTelegramLink){e.preventDefault();TG.openTelegramLink(t.href);}
});
app.addEventListener("input",function(e){if(e.target.id==="q")$("#svc").innerHTML=svcRows(e.target.value)});

function setAccent(a){
  if(a==="ocean")document.documentElement.removeAttribute("data-accent");else document.documentElement.setAttribute("data-accent",a);
  try{localStorage.setItem("flect-accent",a)}catch(e){}
}
try{var sa=localStorage.getItem("flect-accent");if(sa)setAccent(sa)}catch(e){}

var tt,toastFn=null;
function toast(m,action,fn,ms){
  var el=$("#toast");
  el.innerHTML=esc(m)+(action?' <button type="button" class="toast-act">'+esc(action)+'</button>':'');
  toastFn=fn||null;
  el.classList.add("show");clearTimeout(tt);tt=setTimeout(function(){el.classList.remove("show");toastFn=null},ms||2200);
}
$("#toast").addEventListener("click",function(e){if(e.target.closest(".toast-act")&&toastFn){toastFn();}});

/* ===== Liquid dock: bosib turib surish, magnit, silliq prujina ===== */
var track=$("#track"), orb=$("#orb"), tabs=$$(".tab",track);
var centers=[], OW=70, active=0, last=0, pendT=null;
var S={x:0,v:0,t:0,s:1,sv:0,st:1,stretch:0,drag:false,run:false,near:-1,pending:null};

function measure(){
  var r=track.getBoundingClientRect();
  centers=tabs.map(function(t){var b=t.getBoundingClientRect();return b.left-r.left+b.width/2});
  OW=Math.min(tabs[0].getBoundingClientRect().width-4,82);
  track.style.setProperty("--ow",OW+"px");
}
function nearest(x){var bi=0,bd=1e9;centers.forEach(function(c,i){var d=Math.abs(c-x);if(d<bd){bd=d;bi=i}});return bi}
// Gisterezis: ikki tab chegarasida belgi u yoq-bu yoqqa sakramasligi uchun
function pickNear(x){
  var n=nearest(x);
  if(S.near<0||n===S.near)return n;
  return Math.abs(centers[n]-x)<Math.abs(centers[S.near]-x)-10?n:S.near;
}
function paint(){
  var sx=S.s*(1+S.stretch), sy=S.s*(1-S.stretch*.6);
  orb.style.transform="translate3d("+(S.x-OW/2).toFixed(1)+"px,0,0) scale("+sx.toFixed(3)+","+sy.toFixed(3)+")";
  var n=S.drag?pickNear(S.x):-1;
  if(n!==S.near){
    if(S.near>-1&&n>-1)haptic("sel");
    S.near=n; tabs.forEach(function(t,i){t.classList.toggle("near",i===n)});
  }
}
function openPending(){
  clearTimeout(pendT);
  if(!S.pending)return;
  var r=S.pending; S.pending=null; show(r);
}
function step(now){
  var dt=Math.min(.032,((now-last)/1000)||.016); last=now;
  var px=S.x;
  if(S.drag){
    // Barmoqni silliq kuzatish (prujinasiz, tebranishsiz)
    S.x+=(S.t-S.x)*(1-Math.exp(-dt*16));
    S.v=(S.x-px)/dt;
  }else{
    // Qo'yib yuborilganda: yumshoq, deyarli sakramaydigan prujina
    var k=230,c=2*Math.sqrt(k)*.88;
    S.v+=(-k*(S.x-S.t)-c*S.v)*dt; S.x+=S.v*dt;
  }
  // Cho'zilish tezlikka bog'liq, lekin silliqlangan va cheklangan
  var want=Math.min(Math.abs(S.v)/4200,.09);
  S.stretch+=(want-S.stretch)*(1-Math.exp(-dt*9));
  // Kattalashish: kritik so'ndirilgan (qaltiramaydi)
  var k2=320,c2=2*Math.sqrt(k2);
  S.sv+=(-k2*(S.s-S.st)-c2*S.sv)*dt; S.s+=S.sv*dt;
  paint();
  if(S.pending&&!S.drag&&Math.abs(S.x-S.t)<6)openPending();
  if(!S.drag&&Math.abs(S.x-S.t)<.4&&Math.abs(S.v)<6&&Math.abs(S.s-S.st)<.003&&S.stretch<.002){
    S.x=S.t;S.s=S.st;S.v=0;S.stretch=0;S.run=false;paint();return;
  }
  requestAnimationFrame(step);
}
function kick(){
  if(reduce){S.x=S.t;S.s=S.st;S.v=0;S.stretch=0;paint();openPending();return}
  if(!S.run){S.run=true;last=performance.now();requestAnimationFrame(step)}
}
function lift(on){S.st=on?1.12:1;orb.classList.toggle("lifted",on);track.classList.toggle("dragging",on);kick()}
function markTab(i){tabs.forEach(function(t,j){ if(j===i)t.setAttribute("aria-current","page"); else t.removeAttribute("aria-current"); })}
function dockTo(name){
  active=TABS.indexOf(name); markTab(active);
  if(!centers.length)measure();
  if(!S.drag){S.t=centers[active];kick();}
}
function localX(e){return e.clientX-track.getBoundingClientRect().left}

var pid=null,x0=0,moved=false,holdT=null;
track.addEventListener("pointerdown",function(e){
  if(e.button>0||pid!==null)return;
  pid=e.pointerId; try{track.setPointerCapture(pid)}catch(_){}
  measure(); x0=e.clientX; moved=false;
  // Linzaning ustida bosib tursa — biroz kutib kattalashadi
  if(Math.abs(localX(e)-S.x)<OW/2+8) holdT=setTimeout(function(){lift(true)},120);
});
track.addEventListener("pointermove",function(e){
  if(e.pointerId!==pid)return;
  if(!moved&&Math.abs(e.clientX-x0)>8){moved=true;clearTimeout(holdT);S.drag=true;S.near=active;lift(true)}
  if(S.drag){
    var x=localX(e), lo=centers[0]-OW*.3, hi=centers[centers.length-1]+OW*.3;
    if(x<lo)x=lo-(lo-x)*.2; if(x>hi)x=hi+(x-hi)*.2; // chetda rezina
    S.t=x; kick();
  }
});
function release(e,cancel){
  if(e.pointerId!==pid)return;
  clearTimeout(holdT); pid=null;
  var wasDrag=S.drag;
  var idx=wasDrag?pickNear(S.x):nearest(localX(e));
  S.drag=false; lift(false);
  if(cancel){S.t=centers[active];kick();return}
  S.t=centers[idx]; S.v*=.3;
  if(TABS[idx]!==route){
    // Sahifa linza joyiga tushgandan keyin ochiladi
    haptic("light"); markTab(idx);
    S.pending=TABS[idx]; clearTimeout(pendT); pendT=setTimeout(openPending,480);
  }else if(window.scrollY>0){window.scrollTo({top:0,behavior:reduce?"auto":"smooth"})}
  kick();
}
track.addEventListener("pointerup",function(e){release(e,false)});
track.addEventListener("pointercancel",function(e){release(e,true)});
tabs.forEach(function(t,i){t.addEventListener("click",function(e){ if(e.detail===0){show(TABS[i])} })}); // klaviatura
addEventListener("resize",function(){measure();S.x=S.t=centers[active];paint()});

/* ---- Telegram ---- */
if(TG){try{TG.ready();TG.expand();TG.BackButton&&TG.BackButton.onClick(back);TG.setHeaderColor&&TG.setHeaderColor("#030a1c");TG.setBackgroundColor&&TG.setBackgroundColor("#030a1c")}catch(e){}}

/* ---- Boshlash ---- */
show("home");
loadCatalog();
loadMe();
measure(); S.x=S.t=centers[0]; paint();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){measure();S.x=S.t=centers[active];paint()});
})();
