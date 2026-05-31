'use strict';
var PLUGIN_VER='V1.2.27';

// ── SECURITY ─────────────────────────────────────────────────────────────────
var _csrfNonce=(function(){try{return Array.from(crypto.getRandomValues(new Uint8Array(20))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}catch(e){return Math.random().toString(36).slice(2)+Date.now().toString(36);}})();
var _adminToken='';
function generateAdminToken(){
  if(!SESSION)return'';
  var raw=SESSION.user.robloxId+'|'+SESSION.user.username+'|'+_csrfNonce+'|'+Date.now();
  try{return btoa(raw);}catch(e){return raw;}
}
function getAdminHeaders(){
  if(!_adminToken)_adminToken=generateAdminToken();
  return{'Content-Type':'application/json','X-Nexus-Nonce':_csrfNonce,'X-Admin-Token':_adminToken,'X-Roblox-Id':SESSION?String(SESSION.user.robloxId||''):'','X-Username':SESSION?String(SESSION.user.username||''):''};
}

function sanitizeHtml(html){
  if(typeof html!=='string')return'';
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'')
    .replace(/javascript\s*:/gi,'')
    .replace(/vbscript\s*:/gi,'')
    .replace(/data\s*:[^,]*base64/gi,'')
    .replace(/on\w{2,}\s*=/gi,'')
    .replace(/<iframe[\s\S]*?>/gi,'')
    .replace(/<object[\s\S]*?>/gi,'')
    .replace(/<embed[\s\S]*?>/gi,'');
}

var LUA_DANGEROUS_PATTERNS=[
  /require\s*\(\s*['"](http|ftp)/i,
  /loadstring\s*\(/i,
  /dofile\s*\(/i,
  /os\.execute\s*\(/i,
  /io\.(open|read|write)\s*\(/i,
  /debug\.getinfo\s*\(/i,
];
function sanitizeLuaCode(code){
  if(!code||typeof code!=='string')return{ok:false,code:'',reason:'Empty code'};
  if(code.length>150000)return{ok:false,code:'',reason:'Code too large (max 150KB)'};
  for(var i=0;i<LUA_DANGEROUS_PATTERNS.length;i++){
    if(LUA_DANGEROUS_PATTERNS[i].test(code)){
      console.warn('[NEXUS SECURITY] Suspicious Lua pattern detected, blocked.');
      return{ok:false,code:'',reason:'Suspicious code pattern blocked for security'};
    }
  }
  var clean=code.replace(/\x00/g,'').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');
  return{ok:true,code:clean};
}

function sanitizeApiStr(s,max){max=max||500;if(typeof s!=='string')return'';return s.replace(/<[^>]*>/g,'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').slice(0,max);}

function validateApiResponse(data){
  if(!data||typeof data!=='object')return false;
  if(!('content' in data))return false;
  if(typeof data.content!=='string')return false;
  return true;
}

// ── CLIENT RATE LIMIT ─────────────────────────────────────────────────────────
var _apiCallLog={};
function checkClientRateLimit(key,maxPerMin){maxPerMin=maxPerMin||30;var now=Date.now();if(!_apiCallLog[key])_apiCallLog[key]=[];_apiCallLog[key]=_apiCallLog[key].filter(function(t){return now-t<60000;});if(_apiCallLog[key].length>=maxPerMin){toast((curLang==='id'?'Terlalu banyak permintaan, tunggu sebentar':'Too many requests, please wait'),'var(--yellow)',3000);return false;}_apiCallLog[key].push(now);return true;}

var curLang=localStorage.getItem('nexus_lang')||'id';
var SESSION=null;
var studioConnected=false;
var studioPollTimer=null;
var API_URL='/api/control';

// ── ROBLOX DOCS & TOOLBOX SEARCH ─────────────────────────────────────────────
var _docsCache={};
var _docsSearchInProgress=false;

async function searchRobloxDocs(query,maxResults){
  if(!query||query.length<3)return null;
  var cacheKey=query.toLowerCase().trim().slice(0,80);
  if(_docsCache[cacheKey])return _docsCache[cacheKey];
  try{
    var ctrl=new AbortController();
    var tid=setTimeout(function(){ctrl.abort();},8000);
    var r=await fetch(API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      signal:ctrl.signal,
      body:JSON.stringify({action:'search_docs',query:query,doc_type:'all',limit:maxResults||5,_user:(SESSION?SESSION.user.username:'web')})
    });
    clearTimeout(tid);
    if(!r.ok)return null;
    var d=await r.json();
    if(d&&d.results&&d.results.length>0){_docsCache[cacheKey]=d;return d;}
  }catch(e){if(e&&e.name==='AbortError')return null;console.warn('[NEXUS docs] search error:',e&&e.message);}
  return null;
}

async function searchRobloxToolbox(keyword,assetType,limit){
  if(!keyword||keyword.length<2)return null;
  try{
    var ctrl=new AbortController();
    var tid=setTimeout(function(){ctrl.abort();},10000);
    var r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({action:'search_toolbox',keyword:keyword,asset_type:assetType||'Model',limit:limit||6,_user:(SESSION?SESSION.user.username:'web')})});
    clearTimeout(tid);
    if(!r.ok)return null;
    var d=await r.json();
    return(d&&d.status==='ok')?d:null;
  }catch(e){if(e&&e.name==='AbortError')return null;console.warn('[NEXUS toolbox] search error:',e&&e.message);}
  return null;
}

var _DOCS_KEYWORDS=['tweenservice','tween','datastore','remoteevent','remotefunction','bindable','humanoid','leaderstats','collectionservice','pathfinding','runservice','userinputservice','httprequest','http','lighting','terrain','particles','sound','animation','constraint','weld','billboardgui','surfacegui','proximityprompt','clickdetector','badge','marketplace','textchatservice','proximity','attachment','motor6d','hingeconstraint','springconstraint','ropecconstraint','part','model','script','localscript','modulescript','error','bug','issue','crash','api','method','function','service','instance','property','event','enum','spawn','respawn','teleport','npc','enemy','mob','ai','pathfind','jump','walk','health','damage','kill','inventory','backpack','tool','equipment','shop','purchase','buy','sell','coin','gem','currency','economy','rank','level','xp','exp','gui','frame','button','label','image','scroll','viewport','color','material','mesh','texture','decal','light','fire','smoke','timer','countdown','round','game mode','lobby','match','session','admin','ban','kick','mute','chat','message','broadcast'];

function _shouldSearchDocs(txt){if(!txt||txt.length<5)return false;var lower=txt.toLowerCase();for(var i=0;i<_DOCS_KEYWORDS.length;i++){if(lower.indexOf(_DOCS_KEYWORDS[i])>=0)return true;}return false;}

function _buildDocsContext(docsResult){
  if(!docsResult||!docsResult.results||!docsResult.results.length)return'';
  var lines=['[ROBLOX DOCS REFERENCE — Retrieved live for this query]'];
  docsResult.results.slice(0,4).forEach(function(r){lines.push('• '+r.title+': '+r.snippet+' → '+r.url);});
  lines.push('[Use these references to write accurate, up-to-date Roblox code]');
  return lines.join('\n');
}

var REPORT_URL='/api/report';
var K={gemini:'',turnstile:''};
var _turnstileWidget=null;
var OWNER_IDS=['128649548'];
var ADMIN_IDS=[];
var guiElements={},selectedElId=null,guiElCounter=0;
var _stepsEl=null,_stepsList=null,_stepsMap=new Map(),_stepsId=0;
var _stepMeta=new Map();
var _mentionActive=false,_mentionAtPos=-1,_mentionSelIdx=0;
var _wsCache=null,_wsLoading=false;
var _playTestActive=false;

// ── SYNC STATE ────────────────────────────────────────────────────────────────
var _syncTimer=null;
var _syncInProgress=false;
var _syncDebounceTimer=null;
var _syncFailCount=0;

function updateLoader(p,m){var b=document.getElementById('plBar'),t=document.getElementById('plTxt');if(b)b.style.width=p+'%';if(t&&m)t.textContent=m;}
function hideLoader(){var l=document.getElementById('pageLoader');if(!l)return;l.classList.add('hide');setTimeout(function(){l.style.display='none';},500);}
function svgDone(){return'<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';}
function svgFail(){return'<svg class="step-err" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';}
function svgNote(){return'<svg class="step-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';}

// ── LANGUAGE ──────────────────────────────────────────────────────────────────
var LANGS={
id:{placeholder:'Tanya NEXUS AI tentang Roblox... (ketik @ untuk mention)',noConv:'Belum ada percakapan',newchat:'Percakapan Baru',recent:'Riwayat Chat',dash:'Dashboard',son:'Studio: ON',soff:'Studio: OFF',cancel:'Batalkan',connected:'Plugin terhubung — AI siap build di place kamu!',disconnected:'Plugin belum terhubung —',creditsLabel:'Credits',credHint:'Klik untuk beli lebih',helpBtn:'Butuh Bantuan?',inboxBtn:'Inbox',welcomeText:'AI Roblox cerdas — tulis Lua, debug script, buat GUI. Connect plugin untuk inject langsung ke Studio!',chatTitle:'NEXUS AI — Asisten Roblox',installLink:'Cara connect',reconnectLink:'Reconnect',installTitle:'Cara Install Plugin NEXUS AI',installSteps:['Download dari <a href="https://create.roblox.com/store/asset/91870814099475/NEXUS-AI" target="_blank" style="color:var(--cyan)">Creator Store</a>','Simpan ke: <code>C:\\Users\\[Nama]\\AppData\\Local\\Roblox\\Plugins\\</code>','Studio: <strong>Manage Plugin</strong> \u2192 Enable <strong>HTTP Requests</strong> + <strong>Script Injection</strong>','Klik <strong>NEXUS AI</strong> di toolbar Studio \u2192 Klik <strong>CONNECT</strong>','Status hijau = terhubung!'],installClose:'MENGERTI',settingsTitle:'Pengaturan',accountTitle:'Akun',creditsLabel:'Credits',planLabel:'Plan',robloxIdLabel:'Roblox ID',dailyTitle:'Daily Credits',freePlan:'Free Plan',proPlan:'Pro Plan',playTestTitle:'Auto Play Test',playTestLabel:'Jalankan play_test setelah inject',playTestHint:'Nonaktifkan jika laptop crash saat play_test',playTestDurLabel:'Durasi (detik)',langTitle:'Bahasa',langLabel:'Bahasa Interface & AI',reportTitle:'Laporkan Masalah',reportBtn:'Kirim Report',redeemTitle:'Redeem Code',redeemHint:'Dapatkan code di <a href="https://discord.gg/FzAF48mvK5" target="_blank" style="color:var(--cyan)">Discord NEXUS STUDIO</a>',downloadTitle:'Download Plugin',downloadHint:'Install NEXUS AI Plugin di Roblox Studio',downloadPluginBtn:'Download dari Creator Store',logoutLabel:'Logout',close:'TUTUP',guiAddLabel:'Tambah:',guiEmptyText:'Tambah elemen atau klik AI Build',guiLoadingText:'AI sedang membangun UI...',guiToPlaceText:'Kirim ke Place',guiAiBuild:'AI Build',guiClear:'Hapus',guiExport:'Export',guiCodeTitle:'Generated GUI Script',copy:'Copy',download:'Download .lua',guiAiTitle:'AI UI Builder',guiAiDesc:'Deskripsikan UI yang Anda inginkan:',guiAiBuildBtn:'Bangun dengan AI',guiAiCancel:'Batal',guiPropsEmpty:'Pilih elemen',guiLayerTitle:'Layer',avatarClose:'TUTUP',copiedToast:'Tersalin!',reconnectToast:'Menghubungkan ulang...',creditsExhausted:'Credits habis! Beli di Payment.',creditsLow:'Credits tidak cukup.',cancelToast:'Dibatalkan',modelBusyToast:'Model sibuk. Coba model lain.',guiSentToast:'GUI dikirim ke Studio!',guiNotConnectedToast:'Studio belum terhubung!',addElementFirst:'Tambahkan elemen dulu!',aiResponseInvalid:'AI response tidak valid',errorPrefix:'Gagal',clearConfirm:'Hapus semua pesan di percakapan ini?',shareModalTitle:'Bagikan Chat',shareModalDesc:'Salin teks percakapan ini:',shareModalCopy:'Copy Teks',shareClose:'Tutup',workingOn:'Memproses permintaan...',buildingInStudio:'Membangun di Studio...',analyzingReq:'Menganalisis permintaan...',designingSolution:'Merancang solusi...',readingScript:'Membaca script dari Studio...',analyzingError:'Menganalisis error...',designingFix:'Merancang perbaikan...',designingUI:'Merancang UI/UX...',buildingComponents:'Membangun komponen...',preparingEdit:'Mempersiapkan edit...',preparingTest:'Mempersiapkan test...',projectLabel:'Project',testRunning:'Menjalankan play_test',testDone:'Test selesai',testError:'Error ditemukan',loaderInit:'Menginisialisasi...',loaderLoadData:'Memuat data...',loaderConnecting:'Memeriksa koneksi Studio...',loaderReady:'Siap!',dailyReady:'Daily reward tersedia! Klik Claim.',dailyAlready:'Sudah diklaim hari ini.',dailyNext:'Berikutnya: ',injFail:'Gagal kirim ke Studio',tabChat:'Chat',tabGui:'UI Editor',
suggs:[{title:'Loading Screen',body:'Loading screen animasi profesional',q:'Buat loading screen profesional dengan animasi progress bar, tips random, dan transisi halus. Gunakan tema nexus_ai',icon:'<polyline points="1 6 1 22 23 22 23 6"/><path d="M1 6l11 7 11-7"/>'},
{title:'Shop GUI',body:'Toko dengan animasi dan coins',q:'Buat shop GUI lengkap dengan tombol buka tutup, item list, tombol beli, harga, coins display, dan animasi smooth. Gunakan tema nexus_ai',icon:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'},
{title:'Leaderboard',body:'DataStore Coins + Level + Win',q:'Buat sistem DataStore leaderboard untuk game Roblox dengan Coins, Level, dan Win',icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'},
{title:'Admin System',body:'Admin commands dan UI panel',q:'Buat sistem admin commands lengkap dengan kick, ban, give, speed, fly, dan UI panel rapi',icon:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'}]},
en:{placeholder:'Ask NEXUS AI about Roblox... (type @ to mention)',noConv:'No conversations yet',newchat:'New Chat',recent:'Chat History',dash:'Dashboard',son:'Studio: ON',soff:'Studio: OFF',cancel:'Cancel',connected:'Plugin connected — AI ready to build in your place!',disconnected:'Plugin not connected —',creditsLabel:'Credits',credHint:'Click to buy more',helpBtn:'Need Help?',inboxBtn:'Inbox',welcomeText:'Smart Roblox AI — write Lua, debug scripts, build GUIs. Connect plugin to inject directly into Studio!',chatTitle:'NEXUS AI — Roblox Dev Assistant',installLink:'How to connect',reconnectLink:'Reconnect',installTitle:'How to Install NEXUS AI Plugin',installSteps:['Download from <a href="https://create.roblox.com/store/asset/91870814099475/NEXUS-AI" target="_blank" style="color:var(--cyan)">Creator Store</a>','Save to: <code>C:\\Users\\[Name]\\AppData\\Local\\Roblox\\Plugins\\</code>','Studio: <strong>Manage Plugin</strong> \u2192 Enable <strong>HTTP Requests</strong> + <strong>Script Injection</strong>','Click <strong>NEXUS AI</strong> in Studio toolbar \u2192 Click <strong>CONNECT</strong>','Green status = connected!'],installClose:'GOT IT',settingsTitle:'Settings',accountTitle:'Account',creditsLabel:'Credits',planLabel:'Plan',robloxIdLabel:'Roblox ID',dailyTitle:'Daily Credits',freePlan:'Free Plan',proPlan:'Pro Plan',playTestTitle:'Auto Play Test',playTestLabel:'Run play_test after inject',playTestHint:'Disable if PC crashes during play_test',playTestDurLabel:'Duration (seconds)',langTitle:'Language',langLabel:'Interface & AI Language',reportTitle:'Report Issue',reportBtn:'Send Report',redeemTitle:'Redeem Code',redeemHint:'Get codes at <a href="https://discord.gg/FzAF48mvK5" target="_blank" style="color:var(--cyan)">NEXUS STUDIO Discord</a>',downloadTitle:'Download Plugin',downloadHint:'Install NEXUS AI Plugin in Roblox Studio',downloadPluginBtn:'Download from Creator Store',logoutLabel:'Logout',close:'CLOSE',guiAddLabel:'Add:',guiEmptyText:'Add elements or click AI Build',guiLoadingText:'AI is building UI...',guiToPlaceText:'Send to Place',guiAiBuild:'AI Build',guiClear:'Clear',guiExport:'Export',guiCodeTitle:'Generated GUI Script',copy:'Copy',download:'Download .lua',guiAiTitle:'AI UI Builder',guiAiDesc:'Describe the UI you want:',guiAiBuildBtn:'Build with AI',guiAiCancel:'Cancel',guiPropsEmpty:'Select element',guiLayerTitle:'Layers',avatarClose:'CLOSE',copiedToast:'Copied!',reconnectToast:'Reconnecting...',creditsExhausted:'Credits exhausted! Buy at Payment.',creditsLow:'Not enough credits.',cancelToast:'Cancelled',modelBusyToast:'Model busy. Try another model.',guiSentToast:'GUI sent to Studio!',guiNotConnectedToast:'Studio not connected!',addElementFirst:'Add elements first!',aiResponseInvalid:'AI response invalid',errorPrefix:'Failed',clearConfirm:'Delete all messages in this chat?',shareModalTitle:'Share Chat',shareModalDesc:'Copy conversation text:',shareModalCopy:'Copy Text',shareClose:'Close',workingOn:'Processing request...',buildingInStudio:'Building in Studio...',analyzingReq:'Analyzing request...',designingSolution:'Designing solution...',readingScript:'Reading script from Studio...',analyzingError:'Analyzing error...',designingFix:'Designing fix...',designingUI:'Designing UI/UX...',buildingComponents:'Building components...',preparingEdit:'Preparing edit...',preparingTest:'Preparing test...',projectLabel:'Project',testRunning:'Running play_test',testDone:'Test done',testError:'Errors found',loaderInit:'Initializing...',loaderLoadData:'Loading data...',loaderConnecting:'Checking Studio connection...',loaderReady:'Ready!',dailyReady:'Daily reward available! Click Claim.',dailyAlready:'Already claimed today.',dailyNext:'Next: ',injFail:'Send to Studio failed',tabChat:'Chat',tabGui:'UI Editor',
suggs:[{title:'Loading Screen',body:'Professional animated loading screen',q:'Create a professional loading screen with animated progress bar, random tips, and smooth transitions. Use nexus_ai theme',icon:'<polyline points="1 6 1 22 23 22 23 6"/><path d="M1 6l11 7 11-7"/>'},
{title:'Shop GUI',body:'Shop with animations and coins',q:'Create a complete shop GUI with open/close button, item list, buy button, prices, coins display, and smooth animations. Use nexus_ai theme',icon:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'},
{title:'Leaderboard',body:'DataStore Coins + Level + Win',q:'Create a DataStore leaderboard system for Roblox with Coins, Level, and Win stats',icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'},
{title:'Admin System',body:'Admin commands and UI panel',q:'Create a complete admin commands system with kick, ban, give, speed, fly, and a clean UI panel',icon:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'}]}
};
function T(){return LANGS[curLang]||LANGS.en;}

// ── MODELS ────────────────────────────────────────────────────────────────────
var MODEL_LIST=[
{grp:'Google'},
{id:'gemini-3.5-flash',prov:'gemini',cost:2,label:'Gemini 3.5 Flash',icon:'/gemini.png',badge:'FAST'},
{id:'gemini-3.1-flash-lite',prov:'gemini',cost:0,label:'Gemini 3.1 Flash Lite',icon:'/gemini.png',badge:'FREE'},
{id:'gemini-3.1-pro-preview',prov:'gemini',cost:8,label:'Gemini 3.1 Pro',icon:'/gemini.png',badge:'BEST'},
{grp:'StepFun'},
{id:'stepfun/step-3.5-flash',prov:'openrouter',cost:0,label:'Step 3.5 Flash',icon:'/stepfun.png',badge:'FREE'},
{grp:'Poolside'},
{id:'poolside/laguna-m.1:free',prov:'openrouter',cost:0,label:'Laguna M.1',icon:'/laguna.svg',badge:'FREE'},
{grp:'DeepSeek'},
{id:'deepseek/deepseek-v4-flash:free',prov:'openrouter',cost:12,label:'DeepSeek V4 Flash',icon:'/deepseek.svg',badge:'BEST'},
{id:'deepseek/deepseek-v4-flash',prov:'openrouter',cost:22,label:'DeepSeek V4 Pro',icon:'deepseek.svg',badge:'BEST'},
{grp:'Anthropic'},
{id:'anthropic/claude-3.5-haiku',prov:'openrouter',cost:18,label:'Claude Haiku 3.5',icon:'/claude.png',badge:'SMART'},
{id:'anthropic/claude-3.7-sonnet',prov:'openrouter',cost:20,label:'Claude Sonnet 3.7',icon:'/claude.png',badge:'SMART'},
{id:'anthropic/claude-sonnet-4-5',prov:'openrouter',cost:33,label:'Claude Sonnet 4.5',icon:'/claude.png',badge:'FAST'},
{id:'anthropic/claude-opus-4-5',prov:'openrouter',cost:42,label:'Claude Opus 4.5',icon:'/claude.png',badge:'BEST'}
];

var S={
  credits:30,allConvs:[],convs:[],curConv:null,gen:false,cancelCtrl:null,
  selectedTheme:'nexus_ai',
  model:{id:'gemini-3.5-flash',prov:'gemini',cost:2,label:'Gemini 3.5 Flash'},
  guiModel:{id:'gemini-3.5-flash',prov:'gemini',cost:2,label:'Gemini 3.5 Flash'},
  plan:'free',draftText:{},attachments:[],lastClaim:null,unreadInbox:0,
  currentProjectId:null,currentProjectName:null,projects:[],
  playTestEnabled:localStorage.getItem('nexus_play_test')!=='false',
  playTestDuration:Math.max(5,Math.min(120,parseInt(localStorage.getItem('nexus_play_test_dur')||'15')))
};

var GUI_THEMES={
  nexus_ai:{bg:'#030312',panel:'#06071a',card:'#0a0b22',accent:'#00e5ff',accent2:'#8800ff',text:'#b8cfff',corner:10},
  aurora:  {bg:'#030f0a',panel:'#061510',card:'#0a1f17',accent:'#00ffb4',accent2:'#00a8ff',text:'#c0f5e8',corner:12},
  candy:   {bg:'#0f0508',panel:'#180a10',card:'#220d16',accent:'#ff4fa0',accent2:'#ff80cc',text:'#ffcce6',corner:14},
  dark:    {bg:'#080808',panel:'#101010',card:'#181818',accent:'#aaaaaa',accent2:'#666666',text:'#cccccc',corner:6},
  default: {bg:'#0a0c12',panel:'#10141e',card:'#161c28',accent:'#0062d0',accent2:'#00b4ff',text:'#c4cfdf',corner:8},
  midnight:{bg:'#06050f',panel:'#0d0b1a',card:'#130f24',accent:'#6644ff',accent2:'#aa44ff',text:'#c4b8f0',corner:10},
  studs:   {bg:'#0f0800',panel:'#180d00',card:'#221400',accent:'#ff7700',accent2:'#ffaa00',text:'#ffe4cc',corner:4},
  custom:  {bg:'#0d0d0d',panel:'#141414',card:'#1a1a1a',accent:'#888888',accent2:'#555555',text:'#cccccc',corner:8}
};
var _curGuiTheme='nexus_ai';

// ── SESSION ───────────────────────────────────────────────────────────────────
(function(){
  try{
    var s=localStorage.getItem('nexus_session');
    if(!s){location.replace('/');return;}
    var p=JSON.parse(s);
    if(!p||!p.user||!p.user.username||!p.user.robloxId){localStorage.removeItem('nexus_session');location.replace('/');return;}
    if((Date.now()-p.loginTime)>=86400000*7){localStorage.removeItem('nexus_session');location.replace('/');return;}
    SESSION=p;if(!SESSION.data)SESSION.data={};
    var urlp=new URLSearchParams(window.location.search);
    var pathParts=window.location.pathname.split('/');
    var chatsIdx=pathParts.indexOf('chats');
    var hasId=urlp.get('id')||(chatsIdx!==-1&&pathParts[chatsIdx+1]&&pathParts[chatsIdx+1].length>3);
    if(!hasId&&window.location.pathname.endsWith('/chats')){location.replace('/dashboard');return;}
    document.getElementById('app').classList.remove('hidden');
  }catch(e){localStorage.removeItem('nexus_session');location.replace('/');}
})();

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(msg,col,dur){document.querySelectorAll('.nx-toast').forEach(function(x){x.remove();});var t=document.createElement('div');t.className='nx-toast';t.textContent=msg;t.style.cssText='position:fixed;bottom:22px;right:22px;background:var(--bg3);border:1px solid var(--b);border-radius:8px;padding:9px 15px;font-size:11px;z-index:9999;color:'+(col||'var(--cyan)')+';animation:toastIn .2s ease;pointer-events:none;max-width:300px;';document.body.appendChild(t);setTimeout(function(){t.remove();},(dur||2800));}

function stripAllCode(text){
  if(!text)return'';
  text=text.replace(/```[a-zA-Z]*\n[\s\S]*?```/g,'');
  text=text.replace(/```[\s\S]*?```/g,'');
  text=text.replace(/^\s*call:[a-z_]+\([\s\S]*?\)\s*$/gm,'');
  text=text.replace(/\b(?:inject_script|create_gui|create_remote|batch_commands|edit_script|create_script|create_local_script)\s*\(\{[\s\S]*?\}\)/g,'');
  text=text.replace(/\n{3,}/g,'\n\n');
  return text.trim();
}
function cleanAIResponse(text){
  if(!text)return'';
  text=text.replace(/```json[\s\S]*?```/gi,'');
  text=text.replace(/^\s*call:[a-z_]+\([\s\S]*?\)\s*$/gm,'');
  text=text.replace(/\n{3,}/g,'\n\n');
  return text.trim();
}
function isPureGreeting(txt){var t=txt.trim().toLowerCase();if(t.length>60)return false;return/^(halo|hai|hi|hello|hey|selamat\s*(pagi|siang|sore|malam)|good\s*(morning|afternoon|evening|night)|apa\s*kabar|how\s*are\s*you|nexus|ping)[\s?!.,]*$/.test(t);}
function isOwner(){if(!SESSION)return false;var plan=(S.plan||SESSION.data&&SESSION.data.plan||'').toLowerCase();if(plan==='owner'||plan==='unlimited')return true;var roles=(SESSION.data&&SESSION.data.roles)||[];if(roles.indexOf('owner')>=0)return true;return OWNER_IDS.indexOf(String(SESSION.user.robloxId||''))>=0;}
function isAdmin(){if(!SESSION)return false;if(isOwner())return true;var roles=(SESSION.data&&SESSION.data.roles)||[];return roles.indexOf('admin')>=0||ADMIN_IDS.indexOf(String(SESSION.user.robloxId||''))>=0;}

// ── DAILY REWARD ──────────────────────────────────────────────────────────────
function checkDailyOnLoad(){
  if(isOwner()||isAdmin())return;
  var t=T();
  if(!S.lastClaim){toast(t.dailyReady,'var(--green)',5000);return;}
  var diff=(Date.now()-new Date(S.lastClaim).getTime())/3600000;
  if(diff>=24){toast(t.dailyReady,'var(--green)',5000);}
}
function checkDailyCredits(){
  if(isOwner()||isAdmin())return;
  var t=T();
  var ce=document.getElementById('lastClaimInfo'),cb=document.getElementById('claimDailyBtn');
  if(!S.lastClaim){if(ce)ce.textContent=t.dailyReady;if(cb)cb.disabled=false;return;}
  var diff=(Date.now()-new Date(S.lastClaim).getTime())/3600000;
  if(diff>=24){if(ce)ce.textContent=t.dailyReady;if(cb)cb.disabled=false;}
  else{var hrs=Math.ceil(24-diff);if(ce)ce.textContent=t.dailyNext+hrs+'h';if(cb)cb.disabled=true;}
}
function claimDaily(){
  if(isOwner()||isAdmin())return;
  var t=T();
  if(S.lastClaim){var diff=(Date.now()-new Date(S.lastClaim).getTime())/3600000;if(diff<24){toast(t.dailyAlready,'var(--yellow)');return;}}
  var n=S.plan==='pro'?25:2;
  S.credits+=n;S.lastClaim=new Date().toISOString();
  updateCreds();saveS();
  var b=document.getElementById('claimDailyBtn');if(b)b.disabled=true;
  var e=document.getElementById('lastClaimInfo');if(e)e.textContent='+'+n+' CR!';
  toast('+'+n+' CR '+(curLang==='id'?'diklaim!':'claimed!'),'var(--green)');
  setTimeout(checkDailyCredits,500);
}

// ── PLAY TEST ─────────────────────────────────────────────────────────────────
function togglePlayTest(){S.playTestEnabled=!S.playTestEnabled;localStorage.setItem('nexus_play_test',S.playTestEnabled?'true':'false');updatePlayTestUI();toast(S.playTestEnabled?(curLang==='id'?'Auto play_test aktif':'Auto play_test enabled'):(curLang==='id'?'Dinonaktifkan':'Disabled'),S.playTestEnabled?'var(--green)':'var(--yellow)');}
function setPlayTestDur(val){var v=Math.max(5,Math.min(120,parseInt(val)||15));S.playTestDuration=v;localStorage.setItem('nexus_play_test_dur',String(v));var inp=document.getElementById('playTestDurInput');if(inp)inp.value=v;}
function updatePlayTestUI(){var tg=document.getElementById('playTestToggle');if(tg)tg.className='toggle-sw'+(S.playTestEnabled?' on':'');var dur=document.getElementById('playTestDurInput');if(dur)dur.value=S.playTestDuration;}

// ── SAVE / LOAD / SYNC ────────────────────────────────────────────────────────
function getStoreConvs(){
  return(S.allConvs||[]).slice(-30).map(function(c){
    return Object.assign({},c,{msgs:(c.msgs||[]).slice(-40).map(function(m){
      var mc=Object.assign({},m);delete mc._rawContent;
      if(typeof mc.content==='string'&&mc.content.length>6000)mc.content=mc.content.slice(0,6000)+'...';
      return mc;
    })});
  });
}
function saveS(){
  if(!SESSION)return;
  if(!S.allConvs)S.allConvs=[];
  if(S.currentProjectId){
    var others=S.allConvs.filter(function(c){return c.projectId!==S.currentProjectId;});
    var cur=S.convs.map(function(c){var cp=Object.assign({},c);cp.projectId=S.currentProjectId;return cp;});
    S.allConvs=others.concat(cur);
  }else{S.allConvs=S.convs.slice();}
  SESSION.data.credits=S.credits;SESSION.data.plan=S.plan;SESSION.data.model=S.model;SESSION.data.selectedTheme=S.selectedTheme||'nexus_ai';
  SESSION.data.lastClaim=S.lastClaim;SESSION.data.projects=S.projects||SESSION.data.projects;
  SESSION.data.convs=getStoreConvs();
  try{localStorage.setItem('nexus_session',JSON.stringify(SESSION));}
  catch(e){try{SESSION.data.convs=getStoreConvs().slice(-5);localStorage.setItem('nexus_session',JSON.stringify(SESSION));}catch(e2){}}
  _debouncedSync();
}
function _debouncedSync(){
  if(_syncFailCount>=5)return;
  if(_syncDebounceTimer){clearTimeout(_syncDebounceTimer);}
  _syncDebounceTimer=setTimeout(function(){_syncDebounceTimer=null;if(!_syncInProgress)syncToServer();},4000);
}
async function syncToServer(){
  if(!SESSION)return;
  if(_syncInProgress){
    if(!_syncDebounceTimer){_syncDebounceTimer=setTimeout(function(){_syncDebounceTimer=null;if(!_syncInProgress)syncToServer();},4000);}
    return;
  }
  if(_syncFailCount>=5){setTimeout(function(){_syncFailCount=0;},90000);return;}
  _syncInProgress=true;
  var ctrl=new AbortController();
  var timeoutId=setTimeout(function(){ctrl.abort();},12000);
  try{
    var convsTrimmed=getStoreConvs().slice(-15).map(function(c){
      return Object.assign({},c,{msgs:(c.msgs||[]).slice(-20).map(function(m){
        var mc=Object.assign({},m);delete mc._rawContent;
        if(typeof mc.content==='string'&&mc.content.length>3000)mc.content=mc.content.slice(0,3000)+'…';
        return mc;
      })});
    });
    var resp=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({user:(SESSION.user.username||'').toLowerCase(),robloxId:SESSION.user.robloxId,data:{credits:S.credits,plan:S.plan,model:S.model,lastClaim:S.lastClaim,selectedTheme:S.selectedTheme||'nexus_ai',convs:convsTrimmed,projects:S.projects||[],lastSync:Date.now()}})});
    clearTimeout(timeoutId);
    if(resp.ok){_syncFailCount=0;}
    else if(resp.status===500||resp.status===413){_syncFailCount++;}
    else if(resp.status===401||resp.status===403){_syncFailCount=5;}
  }catch(e){clearTimeout(timeoutId);if(e&&e.name!=='AbortError'){_syncFailCount++;}}
  finally{_syncInProgress=false;}
}
function startAutoSync(){
  if(_syncTimer)clearInterval(_syncTimer);
  _syncTimer=setInterval(function(){if(document.hidden)return;if(!_syncInProgress&&!_syncDebounceTimer){syncToServer();}},300000);
}

var _MODEL_ID_MIGRATION={'gemini-2.5-flash-lite':'gemini-3.1-flash-lite','gemini-3-flash-preview':'gemini-3.5-flash','gemini-3.5-flash-preview':'gemini-3.5-flash','gemini-3-pro-preview':'gemini-3.1-pro-preview','gemini-3.5-pro-preview':'gemini-3.1-pro-preview','gemini-3.1-pro-preview':'gemini-3.1-pro-preview','gemini-3.5-ultra-preview':'gemini-3.1-pro-preview'};
function _migrateModelId(modelObj){if(!modelObj||!modelObj.id)return modelObj;var newId=_MODEL_ID_MIGRATION[modelObj.id];if(newId){var found=MODEL_LIST.find(function(m){return m.id===newId;});return found||Object.assign({},modelObj,{id:newId});}return modelObj;}

async function loadS(){
  if(!SESSION)return;
  S.credits=parseFloat((SESSION.data&&SESSION.data.credits!==undefined)?SESSION.data.credits:30)||30;
  S.plan=(SESSION.data&&SESSION.data.plan)||'free';
  S.lastClaim=(SESSION.data&&SESSION.data.lastClaim)||null;
  if(SESSION.data&&SESSION.data.model){var sm=SESSION.data.model;var found=MODEL_LIST.find(function(m){return m.id===sm.id;});if(!found){var migrated=_migrateModelId(sm);found=MODEL_LIST.find(function(m){return m.id===migrated.id;})||migrated;}S.model=found||sm;}
  if(SESSION.data&&SESSION.data.selectedTheme)S.selectedTheme=SESSION.data.selectedTheme||'nexus_ai';
  S.allConvs=(SESSION.data&&SESSION.data.convs)||[];
  S.convs=S.currentProjectId?S.allConvs.filter(function(c){return c.projectId===S.currentProjectId;}):S.allConvs.slice();
  try{
    var ctrl=new AbortController();var tid=setTimeout(function(){ctrl.abort();},12000);
    var r=await fetch('/api/sync?user='+encodeURIComponent((SESSION.user.username||'').toLowerCase())+'&robloxId='+encodeURIComponent(SESSION.user.robloxId||''),{signal:ctrl.signal});
    clearTimeout(tid);
    if(r.ok){var d=await r.json();if(d&&d.credits!==undefined){S.credits=parseFloat(d.credits)||0;S.plan=d.plan||S.plan;S.lastClaim=d.lastClaim||S.lastClaim;if(d.convs&&d.convs.length){S.allConvs=d.convs;S.convs=S.currentProjectId?S.allConvs.filter(function(c){return c.projectId===S.currentProjectId;}):S.allConvs.slice();}if(d.projects)S.projects=d.projects;SESSION.data=Object.assign(SESSION.data||{},d);try{localStorage.setItem('nexus_session',JSON.stringify(SESSION));}catch(e){}}}
  }catch(e){}
}
async function loadKeys(){try{var r=await fetch('/api/main');if(r.ok){var d=await r.json();K.gemini=d.gemini_key||'';K.turnstile=d.turnstile_site_key||'';if(K.turnstile&&window.turnstile){var wrap=document.getElementById('cf-turnstile-wrap');if(wrap)wrap.style.display='block';_turnstileWidget=turnstile.render('#cf-turnstile-report',{sitekey:K.turnstile,theme:'dark',size:'normal',callback:function(token){document.getElementById('_tsToken')&&(document.getElementById('_tsToken').value=token);}});}}}catch(e){}}
async function loadAdminIds(){try{var ctrl=new AbortController();var tid=setTimeout(function(){ctrl.abort();},8000);var r=await fetch('/api/sync?admin_ids=1',{signal:ctrl.signal});clearTimeout(tid);if(r.ok){var d=await r.json();if(d&&d.admin_ids)ADMIN_IDS=d.admin_ids;}}catch(e){}}
async function loadInboxCount(){try{var r=await fetch('/api/inbox?count=1&user='+(SESSION?SESSION.user.username:''));if(r.ok){var d=await r.json();S.unreadInbox=d.count||0;var b=document.getElementById('inboxBadge');if(b)b.textContent=S.unreadInbox;}}catch(e){}}

// ── CREDITS ───────────────────────────────────────────────────────────────────
function updateCreds(){
  var _cr=parseFloat(S.credits||0);
  var v=(isOwner()||isAdmin())?'\u221e':(_cr>=100?_cr.toFixed(0):_cr.toFixed(2));
  var el=document.getElementById('credDisp');if(el)el.textContent=v;
  var el2=document.getElementById('settingsCredits');if(el2)el2.textContent=v+' CR';
  var el4=document.getElementById('settingsRobloxId');if(el4)el4.textContent=SESSION&&SESSION.user.robloxId||'-';
  var c=document.getElementById('credsEl');
  if(c){if(!isOwner()&&!isAdmin()&&parseFloat(S.credits)<5)c.classList.add('low');else c.classList.remove('low');}
}
function updateRoleDisplay(){
  if(!SESSION)return;
  var plan=S.plan||'free';var isO=isOwner(),isA=isAdmin();
  var roleEl=document.getElementById('sbRole'),planEl=document.getElementById('settingsPlan'),badgeEl=document.getElementById('settingsBadge'),adminSec=document.getElementById('adminSection');
  if(roleEl){if(isO)roleEl.textContent='Owner \u00b7 Unlimited';else if(isA)roleEl.textContent='Admin';else if(plan==='pro')roleEl.textContent='Pro Member';else roleEl.textContent='Roblox Developer';}
  if(planEl)planEl.textContent=isO?'OWNER':isA?'Admin':plan.charAt(0).toUpperCase()+plan.slice(1);
  if(badgeEl){if(isO)badgeEl.innerHTML='<span class="badge-owner">OWNER</span>';else if(isA)badgeEl.innerHTML='<span class="badge-admin">ADMIN</span>';else if(plan==='pro')badgeEl.innerHTML='<span class="badge-pro">PRO</span>';else badgeEl.innerHTML='<span style="font-size:9px;color:var(--dim);">FREE</span>';}
  if(adminSec)adminSec.style.display=(isO||isA)?'block':'none';
}

// ── MENTION ───────────────────────────────────────────────────────────────────
async function fetchWsCache(){if(_wsCache||_wsLoading||!SESSION||!studioConnected)return;_wsLoading=true;try{var ctrl=new AbortController();setTimeout(function(){ctrl.abort();},8000);var r=await fetch(API_URL+'?get_workspace=1&user='+encodeURIComponent((SESSION.user.username||'').toLowerCase()),{signal:ctrl.signal});if(r.ok){var d=await r.json();if(d&&d.data)_wsCache=d.data;else if(d&&(d.Workspace||d.ServerScriptService))_wsCache=d;}}catch(e){}_wsLoading=false;}
function extractMentionItems(scan,query){if(!scan)return[];var items=[],q=(query||'').toLowerCase();function traverse(node,svc){if(!node||!node.name||items.length>=25)return;if(!q||node.name.toLowerCase().includes(q))items.push({name:node.name,cls:node.class||'',svc:svc});if(node.children)node.children.forEach(function(c){traverse(c,svc);});}['ServerScriptService','ReplicatedStorage','StarterGui','StarterPlayer','StarterPack','ReplicatedFirst','Workspace'].forEach(function(sn){if(scan[sn]&&scan[sn].children)scan[sn].children.forEach(function(c){traverse(c,sn);});else if(scan[sn])traverse(scan[sn],sn);});items.sort(function(a,b){return(a.cls.includes('Script')?0:1)-(b.cls.includes('Script')?0:1)||a.name.localeCompare(b.name);});return items.slice(0,20);}
function getMentionIcon(cls){if(cls==='LocalScript')return{css:'local',lbl:'LS'};if(cls==='ModuleScript')return{css:'module',lbl:'M'};if(cls==='Script')return{css:'script',lbl:'S'};return{css:'obj',lbl:'O'};}
function showMentionDD(query){var dd=document.getElementById('mentionDD'),inp=document.getElementById('inp');if(!dd||!inp)return;var items=extractMentionItems(_wsCache,query);var list=document.getElementById('mentionList');if(!list)return;_mentionSelIdx=0;if(!studioConnected){list.innerHTML='<div class="mention-empty">'+(curLang==='id'?'Studio belum terhubung':'Studio not connected')+'</div>';}else if(!_wsCache){list.innerHTML='<div class="mention-empty">'+(curLang==='id'?'Memuat...':'Loading...')+'</div>';fetchWsCache();}else if(!items.length){list.innerHTML='<div class="mention-empty">'+(curLang==='id'?'Tidak ada hasil':'No results')+'</div>';}else{list.innerHTML=items.map(function(item,idx){var ic=getMentionIcon(item.cls);return'<div class="mention-item'+(idx===0?' sel':'')+'" onclick="insertMention(\''+esc(item.name)+'\')">'+'<div class="mention-ic '+ic.css+'">'+ic.lbl+'</div>'+'<div style="flex:1;min-width:0;"><div class="mention-name">'+esc(item.name)+'</div><div class="mention-path">'+esc(item.cls||'Instance')+' \u2014 '+esc(item.svc)+'</div></div></div>';}).join('');}var r2=inp.getBoundingClientRect();dd.style.bottom=(window.innerHeight-r2.top+4)+'px';dd.style.left=r2.left+'px';dd.style.width=Math.max(290,r2.width)+'px';dd.classList.add('open');}
function hideMentionDD(){var dd=document.getElementById('mentionDD');if(dd)dd.classList.remove('open');_mentionActive=false;_mentionAtPos=-1;_mentionSelIdx=0;}
function insertMention(name){var inp=document.getElementById('inp');if(!inp)return;var val=inp.value,pos=inp.selectionStart;var atPos=_mentionAtPos>=0?_mentionAtPos:val.lastIndexOf('@',pos-1);if(atPos>=0){inp.value=val.slice(0,atPos)+'@'+name+' '+val.slice(pos);inp.selectionStart=inp.selectionEnd=atPos+name.length+2;}hideMentionDD();inp.focus();inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,130)+'px';}
function moveMentionSel(dir){var list=document.getElementById('mentionList');if(!list)return;var items=list.querySelectorAll('.mention-item');if(!items.length)return;_mentionSelIdx=Math.max(0,Math.min(items.length-1,_mentionSelIdx+dir));items.forEach(function(el,i){el.classList.toggle('sel',i===_mentionSelIdx);});if(items[_mentionSelIdx])items[_mentionSelIdx].scrollIntoView({block:'nearest'});}
function selectCurrentMention(){var list=document.getElementById('mentionList');if(!list)return false;var sel=list.querySelectorAll('.mention-item')[_mentionSelIdx];if(!sel)return false;sel.click();return true;}

// ── LANG ──────────────────────────────────────────────────────────────────────
function renderSuggestions(){var t=T();var grid=document.getElementById('suggGrid');if(!grid)return;grid.innerHTML=t.suggs.map(function(s){return'<div class="sugg" onclick="useSugg(this.dataset.q)" data-q="'+esc(s.q)+'">'+'<div class="sugg-title"><svg viewBox="0 0 24 24">'+s.icon+'</svg>'+esc(s.title)+'</div>'+esc(s.body)+'</div>';}).join('');}
function applyLang(){
  var t=T();
  function s(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
  function sh(id,v){var e=document.getElementById(id);if(e)e.innerHTML=v;}
  function sa(id,a,v){var e=document.getElementById(id);if(e)e[a]=v;}
  sa('inp','placeholder',t.placeholder);s('newChatLbl',t.newchat);s('recentLbl',t.recent);s('dashLbl',t.dash);
  sa('langSelector','value',curLang);s('welcomeText',t.welcomeText);s('chatTitle',t.chatTitle);
  s('plugBannerTxt',studioConnected?t.connected:t.disconnected);s('plugInstallLink',t.installLink);s('plugReconnectLink',t.reconnectLink);
  s('helpBtnText',t.helpBtn);s('inboxBtnText',t.inboxBtn);s('credLabel',t.creditsLabel);s('credHint',t.credHint);s('noConvLbl',t.noConv);
  s('settingsTitle',t.settingsTitle);s('settingsAccountTitle',t.accountTitle);s('settingsCreditsLabel',t.creditsLabel);
  s('settingsPlanLabel',t.planLabel);s('settingsRobloxIdLabel',t.robloxIdLabel);s('dailyCreditsTitle',t.dailyTitle);
  s('freePlanLabel',t.freePlan);s('proPlanLabel',t.proPlan);s('playTestTitle',t.playTestTitle);s('playTestLabel',t.playTestLabel);
  s('playTestHint',t.playTestHint);s('playTestDurLabel',t.playTestDurLabel);s('langTitle',t.langTitle);s('langLabel',t.langLabel);
  s('reportTitle',t.reportTitle);s('reportBtn',t.reportBtn);s('redeemTitle',t.redeemTitle);sh('redeemHint',t.redeemHint);
  s('downloadTitle',t.downloadTitle);s('downloadHint',t.downloadHint);s('downloadPluginBtn',t.downloadPluginBtn);
  s('logoutLabel',t.logoutLabel);s('settingsCloseBtn',t.close);s('avatarCloseBtn',t.avatarClose);
  s('installTitle',t.installTitle);s('installCloseBtn',t.installClose);
  var steps=document.querySelectorAll('.install-txt');t.installSteps.forEach(function(txt,i){if(steps[i])steps[i].innerHTML=txt;});
  s('guiAddLabel',t.guiAddLabel);s('guiEmptyText',t.guiEmptyText);s('guiLoadingText',t.guiLoadingText);s('guiToPlaceText',t.guiToPlaceText);
  s('guiAiBuildLbl',t.guiAiBuild);s('guiClearLbl',t.guiClear);s('guiExportLbl',t.guiExport);
  s('guiCodeTitle',t.guiCodeTitle);s('guiCodeCopyBtn',t.copy);s('guiCodeDlBtn',t.download);s('guiCodeCloseBtn',t.close);
  s('guiAiTitle',t.guiAiTitle);s('guiAiDesc',t.guiAiDesc);s('guiAiBuildBtn',t.guiAiBuildBtn);s('guiAiCancelBtn',t.guiAiCancel);
  s('guiPropsEmpty',t.guiPropsEmpty);s('guiLayerTitle',t.guiLayerTitle);
  s('tabChatLbl',t.tabChat);s('tabGuiLbl',t.tabGui);
  s('shareModalTitle',t.shareModalTitle);s('shareModalDesc',t.shareModalDesc);s('shareModalCopyBtn',t.shareModalCopy);s('shareModalCloseBtn',t.shareClose);
  var mhdr=document.getElementById('mentionHdrTxt');if(mhdr)mhdr.textContent=curLang==='id'?'Scripts & Objek di Place':'Scripts & Objects in Place';
  var aiP=document.getElementById('guiAIPrompt');if(aiP)aiP.placeholder=curLang==='id'?'contoh: Shop GUI 3 item, scroll list, tombol beli...':'e.g. Shop GUI with 3 items, scroll list, buy button...';
  setStudioStatus(studioConnected);updateModelUI();renderConvs();updatePlayTestUI();renderSuggestions();
  document.documentElement.lang=curLang;
}
function changeLang(l){curLang=l;localStorage.setItem('nexus_lang',l);applyLang();}

// ── STUDIO ────────────────────────────────────────────────────────────────────
function setStudioStatus(on){studioConnected=on;var t=T();var badge=document.getElementById('studioBadge'),dot=document.getElementById('studioDot'),txt=document.getElementById('studioTxt'),banner=document.getElementById('plugBanner'),bTxt=document.getElementById('plugBannerTxt');if(on){if(badge)badge.className='status-badge on';if(dot)dot.className='sdot pulse';if(txt)txt.textContent=t.son;if(banner)banner.className='plug-banner connected';if(bTxt)bTxt.textContent=t.connected;if(!_wsCache&&!_wsLoading)fetchWsCache();}else{if(badge)badge.className='status-badge off';if(dot)dot.className='sdot pulse';if(txt)txt.textContent=t.soff;if(banner)banner.className='plug-banner';if(bTxt)bTxt.textContent=t.disconnected;_wsCache=null;_wsLoading=false;}}
function startStudioPoll(){if(studioPollTimer)clearInterval(studioPollTimer);checkStudio();studioPollTimer=setInterval(checkStudio,5000);}
var _pollFailCount=0;
var _POLL_FAIL_THRESHOLD=2;
async function checkStudio(){
  if(!SESSION)return;
  if(S.gen){if(!studioConnected)return;}
  var user=(SESSION.user.username||'').toLowerCase();
  try{
    var ctrl=new AbortController();var tid=setTimeout(function(){ctrl.abort();},8000);
    var r=await fetch(API_URL+'?check=1&user='+encodeURIComponent(user),{signal:ctrl.signal});
    clearTimeout(tid);
    if(r.ok){var d=await r.json();var newStatus=d._pluginConnected===true||d.connected===true||d.online===true;var wasOn=studioConnected;if(newStatus){_pollFailCount=0;setStudioStatus(true);if(!wasOn){_wsCache=null;_wsLoading=false;fetchWsCache();}}else{_pollFailCount++;if(_pollFailCount>=_POLL_FAIL_THRESHOLD&&!S.gen){setStudioStatus(false);}}}
    else{if(!S.gen){_pollFailCount++;if(_pollFailCount>=_POLL_FAIL_THRESHOLD)setStudioStatus(false);}}
  }catch(e){
    if(e&&e.name==='AbortError'){if(!S.gen){_pollFailCount++;if(_pollFailCount>=_POLL_FAIL_THRESHOLD+1)setStudioStatus(false);}}
    else{if(!S.gen){_pollFailCount++;if(_pollFailCount>=_POLL_FAIL_THRESHOLD)setStudioStatus(false);}}
  }
}
async function retryStudio(){_pollFailCount=0;toast(T().reconnectToast);await checkStudio();}

// ── CONVERSATIONS ─────────────────────────────────────────────────────────────
function renderConvs(){var t=T();var list=document.getElementById('convList');if(!list)return;if(!S.convs||!S.convs.length){list.innerHTML='<div class="conv-empty">'+t.noConv+'</div>';return;}list.innerHTML=S.convs.slice().reverse().map(function(cv){var act=cv.id===S.curConv?'act':'';var time=cv.time?new Date(cv.time).toLocaleDateString(curLang==='id'?'id-ID':'en-US',{day:'2-digit',month:'2-digit'}):'';return'<div class="ci '+act+'" onclick="loadConv(\''+cv.id+'\')">'+'<div class="ci-title">'+esc(cv.title||(curLang==='id'?'Percakapan':'Chat'))+'</div><div class="ci-time">'+time+'</div><button class="ci-del" onclick="delConv(event,\''+cv.id+'\')" title="Delete">x</button></div>';}).join('');}
function newChat(){if(S.gen){if(S.cancelCtrl)S.cancelCtrl.abort();S.gen=false;S.cancelCtrl=null;_playTestActive=false;removeStepsCard();var sb=document.getElementById('sendBtn'),cb=document.getElementById('cancelBtn');if(sb)sb.classList.remove('hidden');if(cb)cb.classList.add('hidden');}var id='c'+Date.now();var cv={id:id,title:curLang==='id'?'Percakapan Baru':'New Chat',time:Date.now(),msgs:[],projectId:S.currentProjectId};S.curConv=id;if(!S.convs)S.convs=[];S.convs.push(cv);renderConvs();renderMsgs([]);var ti=document.getElementById('chatTitle');if(ti)ti.textContent=S.currentProjectName?T().projectLabel+': '+S.currentProjectName:T().chatTitle;var w=document.getElementById('welcome');if(w)w.style.display='flex';var inp=document.getElementById('inp');if(inp){inp.value='';inp.style.height='auto';}S.attachments=[];renderAttachRow();saveS();}
function loadConv(id){if(S.gen&&S.curConv!==id){if(S.cancelCtrl)S.cancelCtrl.abort();S.gen=false;S.cancelCtrl=null;_playTestActive=false;removeStepsCard();var sb=document.getElementById('sendBtn'),cb=document.getElementById('cancelBtn');if(sb)sb.classList.remove('hidden');if(cb)cb.classList.add('hidden');}var cv=S.convs.find(function(x){return x.id===id;});if(!cv)return;S.curConv=id;renderConvs();var ti=document.getElementById('chatTitle');if(ti)ti.textContent=cv.title||(curLang==='id'?'Percakapan':'Chat');var w=document.getElementById('welcome');if(w)w.style.display=(cv.msgs&&cv.msgs.length)?'none':'flex';renderMsgs(cv.msgs||[]);S.attachments=[];renderAttachRow();var inp=document.getElementById('inp');if(inp){inp.value=S.draftText[id]||'';inp.style.height='auto';if(inp.value)inp.style.height=Math.min(inp.scrollHeight,130)+'px';}}
function delConv(e,id){e.stopPropagation();S.convs=S.convs.filter(function(x){return x.id!==id;});if(S.curConv===id){if(S.convs.length)loadConv(S.convs[S.convs.length-1].id);else newChat();}renderConvs();saveS();}
function saveDraft(){if(!S.curConv)return;var inp=document.getElementById('inp');if(inp&&inp.value.trim())S.draftText[S.curConv]=inp.value;else delete S.draftText[S.curConv];}
function setConvTitle(convId,firstMsg){var cv=S.convs.find(function(x){return x.id===convId;});if(!cv)return;cv.title=firstMsg.slice(0,45)+(firstMsg.length>45?'..':'');var ti=document.getElementById('chatTitle');if(ti)ti.textContent=cv.title;renderConvs();}
function getProjectIdFromUrl(){var p=new URLSearchParams(window.location.search);var id=p.get('id');if(id)return id;var pts=window.location.pathname.split('/');var ci=pts.indexOf('chats');if(ci!==-1&&pts[ci+1])return pts[ci+1];return null;}
function getProjectName(pid){if(!pid)return null;var projs=S.projects||SESSION&&SESSION.data&&SESSION.data.projects||[];var p=projs.find(function(x){return x.id===pid;});return p?p.name:null;}
function updateProjectUI(){var n=S.currentProjectName;var chip=document.getElementById('sbProjChip'),cn=document.getElementById('sbProjName'),badge=document.getElementById('hdrProjBadge');if(n){if(chip){chip.style.display='';if(cn)cn.textContent=n;}if(badge){badge.style.display='';badge.textContent=n;}}else{if(chip)chip.style.display='none';if(badge)badge.style.display='none';}}

// ── MODEL UI ──────────────────────────────────────────────────────────────────
function getFreeModel(){for(var i=0;i<MODEL_LIST.length;i++){if(MODEL_LIST[i].id&&!MODEL_LIST[i].grp)return MODEL_LIST[i];}return{id:'gemini-3.1-flash-lite',prov:'gemini',cost:0,label:'Gemini 3.1 Flash Lite'};}
function updateModelUI(){var m=S.model||getFreeModel();var el=document.getElementById('inpMName');if(el)el.textContent=m.label||m.id;var b=document.getElementById('inpMBadge');if(b){b.textContent=m.cost<=0?'FREE':m.cost+' CR';b.style.color=m.cost<=0?'var(--green)':m.cost<=1?'var(--cyan)':m.cost<=3?'var(--yellow)':'var(--pink)';}var ic=document.getElementById('inpMIcon');if(ic){ic.src=m.icon||'';ic.style.display=m.icon?'':'none';}var gm=S.guiModel||getFreeModel();var gel=document.getElementById('guiMName');if(gel)gel.textContent=gm.label||gm.id;var gb=document.getElementById('guiMBadge');if(gb){gb.textContent=gm.cost<=0?'FREE':gm.cost+' CR';gb.style.color=gm.cost<=0?'var(--green)':'var(--cyan)';}var gi=document.getElementById('guiMIcon');if(gi){gi.src=gm.icon||'';gi.style.display=gm.icon?'':'none';}}
function buildMDDHtml(forGui){var curId=forGui?S.guiModel.id:S.model.id;var html='';MODEL_LIST.forEach(function(m){if(m.grp){html+='<div class="mg">'+esc(m.grp)+'</div>';return;}var act=m.id===curId;var bc=m.cost<=0?'f':m.badge==='BEST'?'p':'s';var iconHtml=m.icon?'<img src="'+m.icon+'" onerror="this.style.display=\'none\'" style="width:18px;height:18px;object-fit:contain;border-radius:3px;">':'<div style="width:18px;height:18px;border-radius:3px;background:rgba(0,229,255,.1);font-size:9px;display:flex;align-items:center;justify-content:center;color:var(--cyan);">AI</div>';html+='<div class="mo'+(act?' act':'')+'" onclick="selModel(\''+m.id+'\','+(forGui?'true':'false')+')">'+'<div class="mo-icon">'+iconHtml+'</div><div><div class="mo-n">'+esc(m.label||m.id)+'</div><div class="mo-s">'+(m.cost<=0?'Free':m.cost+' CR/msg')+'</div></div><span class="mb-badge '+bc+'">'+(m.badge||(m.cost+' CR'))+'</span></div>';});return html;}
function toggleMDD(e){e.stopPropagation();var dd=document.getElementById('mDD');if(!dd)return;dd.innerHTML=buildMDDHtml(false);var btn=document.getElementById('inpModelBtn');if(btn){var r=btn.getBoundingClientRect();dd.style.bottom=(window.innerHeight-r.top+4)+'px';dd.style.left=r.left+'px';dd.style.right='auto';}dd.classList.toggle('open');}
function toggleGuiMDD(e){e.stopPropagation();var dd=document.getElementById('guiMDD');if(!dd)return;dd.innerHTML=buildMDDHtml(true);var btn=document.getElementById('guiModelBtn');if(btn){var r=btn.getBoundingClientRect();dd.style.top=r.bottom+'px';dd.style.left=r.left+'px';}dd.classList.toggle('open');}
function selModel(id,forGui){var m=MODEL_LIST.find(function(x){return x.id===id;});if(!m||m.grp)return;if(forGui)S.guiModel=m;else S.model=m;updateModelUI();var dd=document.getElementById(forGui?'guiMDD':'mDD');if(dd)dd.classList.remove('open');saveS();}

// ── SUGGESTION CHIPS ─────────────────────────────────────────────────────────
function _injectSuggChipStyles(){
  if(document.getElementById('nx-chip-styles'))return;
  var s=document.createElement('style');
  s.id='nx-chip-styles';
  s.textContent=
    '.suggestion-chips{display:flex;flex-direction:column;gap:5px;margin-top:10px;margin-bottom:2px;}'+
    '.suggestion-chip{'+
      'display:flex;align-items:center;gap:8px;'+
      'padding:7px 12px 7px 10px;'+
      'background:rgba(0,229,255,.05);'+
      'border:1px solid rgba(0,229,255,.16);'+
      'border-radius:8px;'+
      'color:var(--fg,#b8cfff);'+
      'font-size:11.5px;'+
      'cursor:pointer;'+
      'text-align:left;'+
      'transition:background .14s,border-color .14s,color .14s,transform .1s;'+
      'font-family:inherit;'+
      'width:fit-content;'+
      'max-width:100%;'+
      'line-height:1.4;'+
    '}'+
    '.suggestion-chip::before{'+
      'content:"";'+
      'display:inline-flex;'+
      'width:0;height:0;'+
      'border-top:4.5px solid transparent;'+
      'border-bottom:4.5px solid transparent;'+
      'border-left:7px solid var(--cyan,#00e5ff);'+
      'flex-shrink:0;'+
      'opacity:.55;'+
      'transition:opacity .14s,transform .14s;'+
    '}'+
    '.suggestion-chip:hover{'+
      'background:rgba(0,229,255,.12);'+
      'border-color:rgba(0,229,255,.38);'+
      'color:var(--cyan,#00e5ff);'+
    '}'+
    '.suggestion-chip:hover::before{opacity:1;transform:translateX(2px);}'+
    '.suggestion-chip:active{transform:scale(.97);}'+
    '.suggestion-chip.sending{opacity:.5;pointer-events:none;}'+
    '.suggestion-chips-label{font-size:9.5px;color:var(--dim,#4a5568);letter-spacing:.05em;margin-bottom:4px;text-transform:uppercase;}';
  document.head.appendChild(s);
}

function _processSuggestionChips(bubble){
  if(!bubble)return;
  var uls=bubble.querySelectorAll('ul');
  if(!uls.length)return;
  uls.forEach(function(ul){
    if(ul.getAttribute('data-chips-done'))return;
    var liEls=ul.querySelectorAll('li');
    var count=liEls.length;
    if(count<2||count>12)return;
    var allShort=Array.from(liEls).every(function(li){
      return li.textContent.trim().length<=100&&li.querySelectorAll('ul,ol,p,pre').length===0;
    });
    if(!allShort)return;
    var wrap=document.createElement('div');
    wrap.className='suggestion-chips';
    Array.from(liEls).forEach(function(li){
      var text=li.textContent.trim();
      if(!text)return;
      var btn=document.createElement('button');
      btn.className='suggestion-chip';
      btn.textContent=text;
      btn.title=curLang==='id'?'Klik untuk tanya ini':'Click to ask this';
      btn.onclick=function(){
        if(S.gen)return;
        btn.classList.add('sending');
        var inp=document.getElementById('inp');
        if(inp){inp.value=text;inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,130)+'px';inp.focus();}
        setTimeout(function(){send();},80);
      };
      wrap.appendChild(btn);
    });
    if(wrap.children.length>=2){
      ul.parentNode.insertBefore(wrap,ul.nextSibling);
      ul.style.display='none';
      ul.setAttribute('data-chips-done','1');
    }
  });
}

// ── RENDER MESSAGES ───────────────────────────────────────────────────────────
function safeMarked(md){try{if(typeof marked==='undefined')return esc(md);var raw=marked.parse(String(md||''));return sanitizeHtml(raw);}catch(e){return esc(md);}}
function renderMsgs(msgs){var c=document.getElementById('msgs');if(!c)return;var w=document.getElementById('welcome');if(!msgs||!msgs.length){if(w)w.style.display='flex';c.querySelectorAll('.msg,.steps-wrap').forEach(function(el){el.remove();});return;}if(w)w.style.display='none';c.querySelectorAll('.msg,.steps-wrap').forEach(function(el){el.remove();});msgs.forEach(function(m){appendMsg(m,true);});c.scrollTop=c.scrollHeight;}
function mkAv(role){var av=document.createElement('div');av.className='av';if(role==='ai'){var img=document.createElement('img');img.src='nexusai.png';img.alt='N';img.onerror=function(){this.parentElement.style.cssText='display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:linear-gradient(135deg,rgba(0,229,255,.2),rgba(136,0,255,.2));border-radius:50%;';this.remove();this.parentElement.textContent='N';};av.appendChild(img);}else if(SESSION&&SESSION.user.avatar){var img2=document.createElement('img');img2.src=SESSION.user.avatar;img2.alt='U';img2.onerror=function(){this.parentElement.style.cssText='display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:rgba(0,229,255,.1);border-radius:50%;';this.remove();this.parentElement.textContent=SESSION&&SESSION.user.username?SESSION.user.username.charAt(0).toUpperCase():'U';};av.appendChild(img2);}else{av.style.cssText='display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cyan);background:rgba(0,229,255,.1);border-radius:50%;';av.textContent=SESSION&&SESSION.user.username?SESSION.user.username.charAt(0).toUpperCase():'U';}return av;}
function getLangLabel(lang){var map={lua:'Lua',luau:'Luau',js:'JavaScript',javascript:'JavaScript',ts:'TypeScript',python:'Python',py:'Python',html:'HTML',css:'CSS',json:'JSON',bash:'Bash',sh:'Shell'};return map[(lang||'').toLowerCase()]||lang||'Code';}
function getFileExt(lang){var map={lua:'lua',luau:'lua',js:'js',ts:'ts',py:'py',python:'py',html:'html',css:'css',json:'json',bash:'sh',sh:'sh'};return map[(lang||'').toLowerCase()]||'txt';}
function appendMsg(m,skipScroll){
  var c=document.getElementById('msgs');if(!c)return;
  var w=document.getElementById('welcome');if(w)w.style.display='none';
  var isUser=m.role==='user';
  var wrap=document.createElement('div');wrap.className='msg '+(isUser?'user':'ai');
  wrap.setAttribute('data-mid',c.querySelectorAll('.msg').length);
  wrap.appendChild(mkAv(m.role));
  var mbWrap=document.createElement('div');mbWrap.className='mb-wrap';
  var sender=document.createElement('div');sender.className='msg-sender';
  var t2=new Date(m.time||Date.now());
  sender.innerHTML='<span>'+(isUser?'@'+(SESSION&&SESSION.user.username||'You'):'NEXUS AI')+'</span><span>'+t2.toLocaleTimeString(curLang==='id'?'id-ID':'en-US',{hour:'2-digit',minute:'2-digit'})+'</span>';
  mbWrap.appendChild(sender);
  var bubble=document.createElement('div');bubble.className='bubble';
  if(m.attachments&&m.attachments.length){var imgRow=document.createElement('div');imgRow.className='msg-imgs';m.attachments.forEach(function(a){if(a.type==='image'){var img=document.createElement('img');img.className='msg-img';img.src=a.preview||('data:'+(a.mime||'image/png')+';base64,'+a.data);img.alt=a.name||'img';img.onclick=function(){window.open(img.src,'_blank');};imgRow.appendChild(img);}});bubble.appendChild(imgRow);}
  var content=String(m.content||'');
  if(m.studioSummary)content=stripAllCode(content);
  var codeRe=/```(\w*)\n?([\s\S]*?)```/g,codeBlocks=[],processed=content.replace(codeRe,function(match,lang,code){var l=(lang||'').toLowerCase();if(l==='json'||m.studioSummary)return'';var i=codeBlocks.length;codeBlocks.push({lang:lang||'',code:code.trim()});return'%%CB_'+i+'%%';});
  processed.split(/(%%CB_\d+%%)/).forEach(function(part){
    var cm=part.match(/%%CB_(\d+)%%/);
    if(cm){var cb=codeBlocks[parseInt(cm[1])];if(!cb)return;
      var w2=document.createElement('div');w2.className='code-block-wrap';
      var langBar=document.createElement('div');langBar.className='code-lang-bar';
      var btns=document.createElement('div');btns.className='code-btns';
      btns.innerHTML='<button class="cbtn" onclick="copyCode(this)"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button>'+'<button class="cbtn dl" onclick="downloadCode(this,\''+cb.lang+'\')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button>';
      langBar.innerHTML='<span>'+esc(getLangLabel(cb.lang))+'</span>';langBar.appendChild(btns);w2.appendChild(langBar);
      var pre=document.createElement('pre');var codeEl=document.createElement('code');codeEl.className=cb.lang?'language-'+cb.lang:'';codeEl.textContent=cb.code;pre.appendChild(codeEl);w2.appendChild(pre);
      try{hljs.highlightElement(codeEl);}catch(err){}bubble.appendChild(w2);
    }else if(part.trim()){var d=document.createElement('div');d.innerHTML=safeMarked(part);bubble.appendChild(d);}
  });
  if(m.studioSummary&&m.studioSummary.length){var sumDiv=document.createElement('div');sumDiv.className='studio-summary-box';sumDiv.innerHTML='<div class="studio-summary-title"><svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'+(curLang==='id'?'Dibangun di Studio':'Built in Studio')+'</div>'+m.studioSummary.map(function(it){return'<div class="studio-summary-item"><span class="studio-summary-dot"></span>'+esc(it)+'</div>';}).join('');bubble.appendChild(sumDiv);}
  mbWrap.appendChild(bubble);
  if(!isUser)_processSuggestionChips(bubble);
  if(!isUser){var acts=document.createElement('div');acts.className='msg-acts';acts.innerHTML='<button class="mab" onclick="copyMsgText(this)"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button class="mab" onclick="retryMsg(this)"><svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button><button class="mab '+(m._liked?'liked':'')+'" onclick="likeMsg(this,true)"><svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg></button><button class="mab '+(m._disliked?'disliked':'')+'" onclick="likeMsg(this,false)"><svg viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg></button><button class="mab" onclick="openShareModal()"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>';mbWrap.appendChild(acts);}
  wrap.appendChild(mbWrap);c.appendChild(wrap);
  if(!skipScroll)c.scrollTop=c.scrollHeight;
}
function openCodePreview(stepId){var meta=_stepMeta.get(stepId);if(!meta||!meta.code)return;var title=document.getElementById('codePreviewTitle');var path=document.getElementById('codePreviewPath');var codeEl=document.getElementById('codePreviewCode');if(title)title.textContent=(meta.type||'Script')+': '+meta.name;if(path)path.textContent=meta.parent+'/'+meta.name;if(codeEl){codeEl.textContent=meta.code;try{hljs.highlightElement(codeEl);}catch(e){}}document.getElementById('codePreviewModal').classList.add('show');}
function copyPreviewCode(){var codeEl=document.getElementById('codePreviewCode');if(codeEl)navigator.clipboard.writeText(codeEl.textContent).then(function(){toast(T().copiedToast);});}
function copyCode(btn){var pre=btn.closest('.code-block-wrap').querySelector('pre code');if(pre)navigator.clipboard.writeText(pre.textContent).then(function(){toast(T().copiedToast);});}
function downloadCode(btn,lang){var pre=btn.closest('.code-block-wrap').querySelector('pre code');if(!pre)return;var a=document.createElement('a');a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(pre.textContent);a.download='nexus_code.'+getFileExt(lang);a.click();}
function copyMsgText(btn){var b=btn.closest('.mb-wrap').querySelector('.bubble');if(b)navigator.clipboard.writeText(b.innerText||b.textContent).then(function(){toast(T().copiedToast);});}

// ── THINKING STEPS ────────────────────────────────────────────────────────────
function createStepsCard(){removeStepsCard();var c=document.getElementById('msgs');if(!c)return;var w=document.getElementById('welcome');if(w)w.style.display='none';var wrap=document.createElement('div');wrap.className='steps-wrap';wrap.id='stepsWrap';wrap.appendChild(mkAv('ai'));var mbW=document.createElement('div');mbW.className='mb-wrap';var sender=document.createElement('div');sender.className='msg-sender';sender.innerHTML='<span>NEXUS AI</span><span>'+new Date().toLocaleTimeString(curLang==='id'?'id-ID':'en-US',{hour:'2-digit',minute:'2-digit'})+'</span>';mbW.appendChild(sender);var box=document.createElement('div');box.className='steps-box';var hdr=document.createElement('div');hdr.className='steps-hdr';hdr.id='stepsHdr';var spinner=document.createElement('div');spinner.className='steps-hdr-spinner';spinner.id='stepsSpinner';var hdrTxt=document.createElement('span');hdrTxt.className='steps-hdr-txt';hdrTxt.id='stepsTxt';hdrTxt.textContent=T().workingOn;var hdrCount=document.createElement('span');hdrCount.className='steps-hdr-count';hdrCount.id='stepsCount';hdrCount.textContent='(0/0)';hdr.appendChild(spinner);hdr.appendChild(hdrTxt);hdr.appendChild(hdrCount);box.appendChild(hdr);var list=document.createElement('div');list.className='steps-list';list.id='stepsList';box.appendChild(list);var cancelDiv=document.createElement('div');cancelDiv.className='steps-cancel';cancelDiv.id='stepsCancel';var cb=document.createElement('button');cb.className='steps-cancel-btn';cb.textContent=T().cancel;cb.onclick=cancelGen;cancelDiv.appendChild(cb);box.appendChild(cancelDiv);mbW.appendChild(box);wrap.appendChild(mbW);c.appendChild(wrap);_stepsEl=wrap;_stepsList=list;_stepsMap.clear();_stepsId=0;c.scrollTop=c.scrollHeight;}
function removeStepsCard(){var el=document.getElementById('stepsWrap');if(el)el.remove();_stepsEl=null;_stepsList=null;_stepsMap.clear();_stepMeta.clear();}
function clearSteps(){if(!_stepsList)return;_stepsList.innerHTML='';_stepsMap.clear();_stepsId=0;var cnt=document.getElementById('stepsCount');if(cnt)cnt.textContent='';}
function addStep(text,state,sub,meta){
  if(!_stepsList)return null;
  var id=++_stepsId;
  var row=document.createElement('div');
  row.className='step-row';
  row.setAttribute('data-st',state||'running');
  var ic=document.createElement('div');ic.className='step-ic';
  if(state==='running'){var sp=document.createElement('div');sp.className='step-spin';ic.appendChild(sp);}
  else if(state==='done')ic.innerHTML='<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  else if(state==='error')ic.innerHTML='<svg class="step-err" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  else if(state==='info')ic.innerHTML='<svg class="step-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  else ic.innerHTML='<div class="step-pend"></div>';
  row.appendChild(ic);
  var cont=document.createElement('div');cont.className='step-content';
  var txtEl=document.createElement('div');txtEl.className='step-txt';
  if(meta&&meta.code){
    _stepMeta.set(id,meta);
    txtEl.style.cssText='cursor:pointer;display:flex;align-items:center;gap:4px;';
    txtEl.innerHTML=text.replace(/</g,'&lt;')+'<svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" style="flex-shrink:0;color:var(--cyan);"><polyline points="9 18 15 12 9 6"/></svg>';
    txtEl.onclick=function(){openCodePreview(id);};
    txtEl.title=curLang==='id'?'Klik untuk lihat kode':'Click to preview code';
  }else{
    txtEl.textContent=text;
  }
  cont.appendChild(txtEl);
  if(sub){var sv=document.createElement('div');sv.className='step-sub';sv.textContent=sub;cont.appendChild(sv);}
  row.appendChild(cont);
  _stepsList.appendChild(row);
  _stepsMap.set(id,row);
  var cc=document.getElementById('msgs');if(cc)cc.scrollTop=cc.scrollHeight;
  var cnt=document.getElementById('stepsCount');
  if(cnt){var done=_stepsList.querySelectorAll('[data-st="done"]').length;cnt.textContent='('+done+'/'+_stepsId+')';}
  return id;
}
function updateStep(id,state,text,sub){var row=_stepsMap.get(id);if(!row)return;row.setAttribute('data-st',state);var ic=row.querySelector('.step-ic');if(ic){if(state==='running')ic.innerHTML='<div class="step-spin"></div>';else if(state==='done')ic.innerHTML='<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';else if(state==='error')ic.innerHTML='<svg class="step-err" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';else if(state==='info')ic.innerHTML='<svg class="step-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';}if(text){var t=row.querySelector('.step-txt');if(t)t.textContent=text;}if(sub!==undefined){var sv=row.querySelector('.step-sub');if(!sv&&sub){sv=document.createElement('div');sv.className='step-sub';row.querySelector('.step-content').appendChild(sv);}if(sv)sv.textContent=sub||'';}
  if(_stepsList){var cnt=document.getElementById('stepsCount');if(cnt){var done=_stepsList.querySelectorAll('[data-st="done"]').length;cnt.textContent='('+done+'/'+_stepsId+')';}}
}
function finalizeSteps(){var spinner=document.getElementById('stepsSpinner');if(spinner)spinner.style.display='none';var hdrTxt=document.getElementById('stepsTxt');if(hdrTxt)hdrTxt.style.color='var(--green)';var cancelDiv=document.getElementById('stepsCancel');if(cancelDiv)cancelDiv.remove();_stepsMap.forEach(function(row){if(row.getAttribute('data-st')==='running'){var ic=row.querySelector('.step-ic');if(ic)ic.innerHTML='<svg class="step-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';row.setAttribute('data-st','done');}});}
function setStepTitle(txt){var el=document.getElementById('stepsTxt');if(el)el.textContent=txt;}
function cancelGen(){if(S.cancelCtrl)S.cancelCtrl.abort();S.gen=false;S.cancelCtrl=null;_playTestActive=false;removeStepsCard();var sb=document.getElementById('sendBtn'),cb=document.getElementById('cancelBtn');if(sb)sb.classList.remove('hidden');if(cb)cb.classList.add('hidden');toast(T().cancelToast,'var(--yellow)');}

// ══════════════════════════════════════════════════════════════════════════════
// NEXUS AI — Inject Pipeline v10.0
// Fixes: JSON repair edge cases, Lua block false-positives, race conditions,
//        AbortError propagation, duplicate dedup, step counter sync, retry logic
// ══════════════════════════════════════════════════════════════════════════════

// ── JSON PARSING PIPELINE ─────────────────────────────────────────────────────

function _stripLuaExpressions(str) {
  if (typeof str !== 'string') return str;
  // UDim2.new
  str = str.replace(/UDim2\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, function(m, args) {
    var parts = args.split(',').map(function(p) { return parseFloat(p.trim()) || 0; });
    return '[' + parts.join(',') + ']';
  });
  // Vector3.new
  str = str.replace(/Vector3\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, function(m, args) {
    var parts = args.split(',').map(function(p) { return parseFloat(p.trim()) || 0; });
    return '[' + parts.join(',') + ']';
  });
  // Color3.fromRGB
  str = str.replace(/Color3\.fromRGB\s*\(\s*([\d.\s,]+)\s*\)/g, function(m, args) {
    var parts = args.split(',').map(function(p) { return parseInt(p.trim()) || 0; });
    return '[' + parts.join(',') + ']';
  });
  str = str.replace(/Color3\.new\s*\([^)]*\)/g, 'null');
  // Vector2.new
  str = str.replace(/Vector2\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, function(m, args) {
    var parts = args.split(',').map(function(p) { return parseFloat(p.trim()) || 0; });
    return '[' + parts.join(',') + ']';
  });
  // UDim.new
  str = str.replace(/UDim\.new\s*\(\s*([-\d.\s,]+)\s*\)/g, function(m, args) {
    var parts = args.split(',').map(function(p) { return parseFloat(p.trim()) || 0; });
    return '[' + parts.join(',') + ']';
  });
  str = str.replace(/BrickColor\.new\s*\(\s*"([^"]+)"\s*\)/g, '"$1"');
  str = str.replace(/BrickColor\.new\s*\(\s*'([^']+)'\s*\)/g, '"$1"');
  str = str.replace(/Enum\.[A-Za-z]+\.([A-Za-z]+)/g, '"$1"');
  str = str.replace(/CFrame\.[a-zA-Z]*\s*\([^)]*\)/g, 'null');
  str = str.replace(/NumberRange\.new\s*\([^)]*\)/g, 'null');
  str = str.replace(/NumberSequence\.new\s*\([^)]*\)/g, 'null');
  str = str.replace(/ColorSequence\.new\s*\([^)]*\)/g, 'null');
  // Generic Roblox constructors — limit match length to avoid runaway
  str = str.replace(/\b[A-Z][a-zA-Z]+\.[a-zA-Z]+\s*\([^)]{0,200}\)/g, 'null');
  return str;
}

function _normalizeCmd(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  var actionName = obj.action || obj.command || obj.type || '';
  if (!actionName || typeof actionName !== 'string') return null;
  actionName = String(actionName).trim();
  if (actionName.length === 0 || actionName.length > 80) return null;
  // Only allow valid snake_case action names
  if (!/^[a-z_][a-z0-9_]*$/.test(actionName)) return null;
  var result = { action: actionName };
  // Flatten params sub-object
  if (obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)) {
    Object.keys(obj.params).forEach(function(k) {
      if (k !== 'action' && k !== 'command' && k !== 'type') {
        result[k] = obj.params[k];
      }
    });
  }
  // Copy top-level keys
  Object.keys(obj).forEach(function(k) {
    if (k !== 'action' && k !== 'command' && k !== 'type' && k !== 'params') {
      result[k] = obj[k];
    }
  });
  // Normalize code -> source alias
  if (result.code && !result.source) {
    result.source = result.code;
    delete result.code;
  }
  return result;
}

function _jsonSanitize(str) {
  if (!str || typeof str !== 'string') return str;
  var out = '';
  var inStr = false;
  var escaped = false;
  var i = 0;
  while (i < str.length) {
    var c = str[i];
    var code = str.charCodeAt(i);
    if (escaped) { out += c; escaped = false; i++; continue; }
    if (c === '\\' && inStr) { out += c; escaped = true; i++; continue; }
    if (c === '"') { inStr = !inStr; out += c; i++; continue; }
    // Strip // comments (outside strings)
    if (!inStr && c === '/' && str[i + 1] === '/') {
      while (i < str.length && str[i] !== '\n') i++;
      continue;
    }
    // Strip /* */ comments (outside strings)
    if (!inStr && c === '/' && str[i + 1] === '*') {
      i += 2;
      while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Strip -- Lua comments (outside strings)
    if (!inStr && c === '-' && str[i + 1] === '-') {
      while (i < str.length && str[i] !== '\n') i++;
      continue;
    }
    // Escape control characters inside strings
    if (inStr) {
      if (c === '\n') { out += '\\n'; i++; continue; }
      if (c === '\r') { out += '\\r'; i++; continue; }
      if (c === '\t') { out += '\\t'; i++; continue; }
      if (code < 0x20) { out += '\\u' + ('000' + code.toString(16)).slice(-4); i++; continue; }
    }
    out += c;
    i++;
  }
  return out;
}

function _jsonRepair(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  raw = _stripLuaExpressions(raw);
  raw = _jsonSanitize(raw);
  // Lua/JS assignment syntax: { key = value } -> { "key": value }
  raw = raw.replace(/([{,\[]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*=\s*(?![=>]))/g, '$1"$2": ');
  // Unquoted keys: { key: value } -> { "key": value }
  raw = raw.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:(?!:))/g, '$1"$2"$3');
  // Single-quoted string values -> double-quoted
  raw = raw.replace(/:\s*'([^'\\]*)'/g, ':"$1"');
  raw = raw.replace(/\[\s*'([^'\\]*)'/g, '["$1"');
  raw = raw.replace(/,\s*'([^'\\]*)'/g, ',"$1"');
  // Trailing commas before ] or }
  raw = raw.replace(/,(\s*[}\]])/g, '$1');
  // Python/Lua boolean/null literals
  raw = raw.replace(/:\s*True\b/g, ':true').replace(/:\s*False\b/g, ':false');
  raw = raw.replace(/:\s*None\b/g, ':null').replace(/:\s*nil\b/g, ':null');
  return raw;
}

function _tryParseJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  raw = raw.trim();
  if (!raw) return null;
  if (raw.length > 50000) return null;
  if (!raw.startsWith('{') && !raw.startsWith('[')) return null;
  // Attempt 1: raw
  try { return JSON.parse(raw); } catch (e) {}
  // Attempt 2: strip Lua expressions then parse
  var stripped = _stripLuaExpressions(raw);
  try { return JSON.parse(stripped); } catch (e) {}
  // Attempt 3: full repair on raw
  try { return JSON.parse(_jsonRepair(raw)); } catch (e) {}
  // Attempt 4: full repair on stripped
  try { return JSON.parse(_jsonRepair(stripped)); } catch (e) {}
  // Attempt 5: extract outermost JSON structure from stripped
  var jm = stripped.match(/(\[[\s\S]+\]|\{[\s\S]+\})/);
  if (jm) {
    try { return JSON.parse(jm[1]); } catch (e) {}
    try { return JSON.parse(_jsonRepair(jm[1])); } catch (e) {}
  } else {
    var jm2 = raw.match(/(\[[\s\S]+\]|\{[\s\S]+\})/);
    if (jm2) {
      try { return JSON.parse(_jsonRepair(jm2[1])); } catch (e) {}
    }
  }
  return null;
}

// ── LUA BLOCK DETECTION ───────────────────────────────────────────────────────

// Patterns that indicate an "action call block" (not real Lua to inject)
var _LUA_ACTION_PATTERNS = [
  /^\s*create_remote\s*\(/m,
  /^\s*inject_script\s*\(/m,
  /^\s*create_gui\s*\(/m,
  /^\s*create_frame\s*\(/m,
  /^\s*batch_commands\s*\(/m,
  /^\s*create_script\s*\(/m,
  /^\s*create_local_script\s*\(/m,
  /^\s*create_module\s*\(/m,
  /^\s*edit_script\s*\(/m,
  /^\s*create_part\s*\(/m,
  /^\s*set_property\s*\(/m,
  /^\s*create_text_label\s*\(/m,
  /^\s*inject_quick_script\s*\(/m,
  /^\s*set_lighting\s*\(/m,
  /^\s*create_npc\s*\(/m,
];

// Returns true if the code block looks like action-call pseudocode, not real Lua
function isActionCallBlock(code) {
  var count = 0;
  for (var i = 0; i < _LUA_ACTION_PATTERNS.length; i++) {
    if (_LUA_ACTION_PATTERNS[i].test(code)) {
      count++;
      if (count >= 2) return true;
    }
  }
  if (count === 1) {
    // Check for real Lua indicators — if none found, treat as action block
    var hasRealLua = /\bgame:GetService\b|\blocal\s+\w+\s*=\s*Instance\.new\b|\bPlayers\.LocalPlayer\b|\bscript\.Parent\b|\btask\.spawn\b|\btask\.wait\b/.test(code);
    if (!hasRealLua) return true;
  }
  return false;
}

// Extract real Lua code blocks from AI response (excluding action-call pseudocode)
function parseLuaBlocks(text) {
  var blocks = [];
  var re = /```(?:lua|luau)\s*([\s\S]*?)```/gi;
  var m;
  while ((m = re.exec(text)) !== null) {
    var c = m[1].trim();
    if (c.length < 10) continue;
    if (isActionCallBlock(c)) continue;
    if (/--\s*Command\s*Batch\s*Start/i.test(c)) continue;
    if (/^\s*batch_commands\s*\(\s*\{/.test(c)) continue;
    if (/^\s*\{\s*["']?action["']?\s*[=:]\s*["']/.test(c)) continue;
    // Skip trivial remote declarations (6 or fewer real lines)
    if (
      /^\s*(local\s+\w+\s*=\s*)?Instance\.new\(["']Remote(Event|Function)["']\)/.test(c) &&
      c.split('\n').filter(function(l) { return l.trim() && !l.trim().startsWith('--'); }).length <= 6
    ) continue;
    blocks.push(c);
  }
  return blocks;
}

// ── JSON COMMAND BLOCK PARSER ─────────────────────────────────────────────────

function parseJsonBlocks(text) {
  var cmds = [];
  var re = /```(?:json|JSON|Json)\s*\n?([\s\S]*?)```/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var raw = m[1].trim();
    if (!raw || raw.length < 5) continue;
    if (raw.length > 30000) continue;
    // Skip if it looks like pure Lua without an action key
    if (
      /^\s*(local\s+|function\s+[a-zA-Z]|game:Get|return\s+\{)/.test(raw) &&
      !/"action"/.test(raw) &&
      !/"command"/.test(raw)
    ) continue;

    var processed = _stripLuaExpressions(raw);
    // Normalize Lua assignment syntax
    processed = processed.replace(
      /([{,\[]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*=\s*(?![=>]))/g,
      '$1"$2": '
    );

    // Check for function-call wrapping: funcname({ ... })
    var fnMatch = processed.match(/^\s*([a-z_][a-z0-9_]{2,49})\s*\(\s*(\{[\s\S]+\})\s*\)\s*;?\s*$/);
    if (fnMatch) {
      var fnName = fnMatch[1];
      var bodyStr = fnMatch[2];
      var fnParsed = _tryParseJson(bodyStr);
      if (fnParsed && typeof fnParsed === 'object') {
        if (fnName === 'batch_commands') {
          var batchArr = fnParsed.commands || fnParsed.actions || (Array.isArray(fnParsed) ? fnParsed : null);
          if (Array.isArray(batchArr)) {
            batchArr.forEach(function(sub) {
              var norm = _normalizeCmd(sub);
              if (norm) cmds.push(norm);
            });
            continue;
          }
        } else {
          var fnCmd = Object.assign({ action: fnName }, Array.isArray(fnParsed) ? {} : fnParsed);
          var norm = _normalizeCmd(fnCmd);
          if (norm) { cmds.push(norm); continue; }
        }
      }
    }

    var parsed = _tryParseJson(processed);
    if (!parsed) continue;

    var items = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed.batch_commands && Array.isArray(parsed.batch_commands)) {
      items = parsed.batch_commands;
    } else if (parsed.commands && Array.isArray(parsed.commands)) {
      items = parsed.commands;
    } else if (parsed.actions && Array.isArray(parsed.actions)) {
      items = parsed.actions;
    } else if (parsed.action || parsed.command || parsed.type) {
      items = [parsed];
    } else {
      // Try to find a nested array of commands
      var foundArr = false;
      Object.keys(parsed).forEach(function(k) {
        if (!foundArr && Array.isArray(parsed[k]) && parsed[k].length > 0) {
          var first = parsed[k][0];
          if (first && typeof first === 'object' && (first.action || first.command || first.type)) {
            items = parsed[k];
            foundArr = true;
          }
        }
      });
      // Try top-level keys as action names
      if (!foundArr && Object.keys(parsed).length > 0) {
        Object.keys(parsed).forEach(function(k) {
          if (/^[a-z_][a-z0-9_]*$/.test(k) && typeof parsed[k] === 'object' && !Array.isArray(parsed[k])) {
            var candidate = Object.assign({ action: k }, parsed[k]);
            if (_normalizeCmd(candidate)) items.push(candidate);
          }
        });
      }
    }

    items.forEach(function(item) {
      if (!item || typeof item !== 'object') return;
      if (!Array.isArray(item)) {
        if (item.batch_commands && Array.isArray(item.batch_commands)) {
          item.batch_commands.forEach(function(sub) {
            var norm = _normalizeCmd(sub);
            if (norm) cmds.push(norm);
          });
          return;
        }
        if (item.commands && Array.isArray(item.commands)) {
          item.commands.forEach(function(sub) {
            var norm = _normalizeCmd(sub);
            if (norm) cmds.push(norm);
          });
          return;
        }
      }
      var norm = _normalizeCmd(item);
      if (norm) cmds.push(norm);
    });
  }
  return cmds;
}

// ── LUA ACTION-CALL BLOCK EXTRACTOR ──────────────────────────────────────────

function _extractActionsFromLuaBlock(blockCode) {
  var cmds = [];
  var pos = 0;
  var code = blockCode;
  var SKIP_FNS = new Set([
    'function','require','print','warn','error','local','if','for','while','end',
    'do','then','return','and','or','not','true','false','nil','table','string',
    'math','tostring','tonumber','type','pairs','ipairs','next','select','unpack',
    'pcall','xpcall','rawget','rawset','task','game','workspace','script'
  ]);

  while (pos < code.length) {
    var searchStr = code.slice(pos);
    var re = /\b([a-z_][a-z0-9_]{3,49})\s*\(\s*\{/g;
    re.lastIndex = 0;
    var m = re.exec(searchStr);
    if (!m) break;
    var fnName = m[1];
    if (SKIP_FNS.has(fnName)) { pos += m.index + m[0].length; continue; }

    var braceStart = pos + m.index + m[0].length - 1;
    var depth = 0, inStr = false, strChar = '', inLongStr = false, bodyEnd = -1;

    for (var bi = braceStart; bi < code.length; bi++) {
      var ch = code[bi];
      if (!inStr && ch === '[' && code[bi + 1] === '[') { inLongStr = true; bi += 1; continue; }
      if (inLongStr && ch === ']' && code[bi + 1] === ']') { inLongStr = false; bi += 1; continue; }
      if (inLongStr) continue;
      if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; continue; }
      if (inStr && ch === strChar && code[bi - 1] !== '\\') { inStr = false; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { bodyEnd = bi; break; } }
    }
    if (bodyEnd < 0) { pos += m.index + m[0].length; continue; }

    var body = code.slice(braceStart, bodyEnd + 1);
    // Handle long-string source fields [[ ... ]]
    if (body.indexOf('[[') >= 0) {
      var nameM = body.match(/name\s*=\s*["']([^"']+)["']/);
      var parentM = body.match(/parent\s*=\s*["']([^"']+)["']/);
      var typeM = body.match(/script_type\s*=\s*["']([^"']+)["']/);
      var srcM = body.match(/source\s*=\s*\[\[([^\]]*(?:\][^\]][^\]]*)*)\]\]/);
      if (fnName === 'inject_script' && nameM) {
        var cmd = {
          action: 'inject_script',
          name: nameM[1],
          parent: parentM ? parentM[1] : 'ServerScriptService',
          script_type: typeM ? typeM[1] : 'Script',
          source: srcM ? srcM[1].trim() : ''
        };
        if (cmd.source && cmd.source.length > 5) cmds.push(cmd);
      }
    } else {
      var stripped = _stripLuaExpressions(body);
      var parsed = _tryParseJson(stripped) || _tryParseJson(_jsonRepair(stripped));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        var cmd2 = Object.assign({ action: fnName }, parsed);
        var norm = _normalizeCmd(cmd2);
        if (norm) cmds.push(norm);
      }
    }
    pos = bodyEnd + 1;
  }
  return cmds;
}

// ── CALL BLOCK PARSER ─────────────────────────────────────────────────────────

function parseCallBlocks(text) {
  var cmds = [];
  var luaActionText = '';
  var SKIP_FNS = new Set([
    'function','require','print','warn','error','typeof','instanceof',
    'Object','Array','String','Number','Boolean','Math','JSON','Promise',
    'fetch','console','setTimeout','setInterval','parseInt','parseFloat',
    'task','game','workspace','script','Instance','pcall','xpcall'
  ]);

  // Process Lua action-call blocks first
  var reLua = /```(?:lua|luau)\s*([\s\S]*?)```/gi;
  var mLua;
  while ((mLua = reLua.exec(text)) !== null) {
    var block = mLua[1].trim();
    if (isActionCallBlock(block)) {
      var extracted = _extractActionsFromLuaBlock(block);
      extracted.forEach(function(cmd) { cmds.push(cmd); });
      luaActionText += '\n' + block;
    }
  }

  // Remove all code blocks from text for plain-text scanning
  var textNoBlocks = text.replace(/```[\s\S]*?```/g, '');
  var searchText = textNoBlocks + '\n' + luaActionText;

  // call:action_name({ ... }) syntax
  var re1 = /call:([a-z_]+)\(\s*(\{[\s\S]+?\})\s*\)/g;
  var m;
  while ((m = re1.exec(searchText)) !== null) {
    var params = _tryParseJson(_stripLuaExpressions(m[2]));
    if (m[1] && params) {
      var cmd = Object.assign({ action: m[1] }, params);
      var norm = _normalizeCmd(cmd);
      if (norm) cmds.push(norm);
    }
  }

  // Plain funcname({ ... }) calls in non-code text
  var re2 = /\b([a-z_][a-z0-9_]{2,49})\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
  while ((m = re2.exec(textNoBlocks)) !== null) {
    var fnName = m[1];
    if (SKIP_FNS.has(fnName)) continue;
    var bodyStr = _stripLuaExpressions(m[2]);
    var params2 = _tryParseJson(bodyStr);
    if (!params2 || typeof params2 !== 'object') continue;
    if (fnName === 'batch_commands') {
      var batchCmds = params2.commands || params2.actions || (Array.isArray(params2) ? params2 : null);
      if (Array.isArray(batchCmds)) {
        batchCmds.forEach(function(sub) {
          var norm = _normalizeCmd(sub);
          if (norm) cmds.push(norm);
        });
      }
    } else {
      var cmd2 = Object.assign({ action: fnName }, Array.isArray(params2) ? {} : params2);
      var norm2 = _normalizeCmd(cmd2);
      if (norm2) cmds.push(norm2);
    }
  }

  // Deduplicate by action+name
  var seen = {};
  return cmds.filter(function(cmd) {
    var key = (cmd.action || '') + '|' + (cmd.name || '') + '|' + (cmd.parent || '');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

// ── MASTER PARSER ─────────────────────────────────────────────────────────────

function parseAllCommands(text) {
  var cmds = parseJsonBlocks(text);
  var callCmds = parseCallBlocks(text);

  // Merge, avoiding duplicates
  callCmds.forEach(function(cmd) {
    var exists = cmds.some(function(e) {
      return e.action === cmd.action && (e.name || '') === (cmd.name || '');
    });
    if (!exists) cmds.push(cmd);
  });

  // Fallback: scan raw text for JSON with "action" key
  if (cmds.length === 0) {
    var jsonMatches = text.match(/(\[[\s\S]*?"action"[\s\S]*?\]|\{[\s\S]*?"action"[\s\S]*?\})/g);
    if (jsonMatches) {
      jsonMatches.forEach(function(raw) {
        if (raw.length > 30000) return;
        var parsed = _tryParseJson(raw.trim());
        if (!parsed) return;
        var items = Array.isArray(parsed) ? parsed : [parsed];
        items.forEach(function(item) {
          if (!item || !item.action) return;
          var norm = _normalizeCmd(item);
          if (norm) {
            var exists = cmds.some(function(e) {
              return e.action === norm.action && (e.name || '') === (norm.name || '');
            });
            if (!exists) cmds.push(norm);
          }
        });
      });
    }
  }

  // Last resort: extract from "commands": [...] pattern
  if (cmds.length === 0) {
    var batchMatch = text.match(/"commands"\s*:\s*(\[[\s\S]*?\])/);
    if (batchMatch) {
      var batchParsed = _tryParseJson(batchMatch[1]);
      if (Array.isArray(batchParsed)) {
        batchParsed.forEach(function(item) {
          var norm = _normalizeCmd(item);
          if (norm && !cmds.some(function(e) {
            return e.action === norm.action && (e.name || '') === (norm.name || '');
          })) {
            cmds.push(norm);
          }
        });
      }
    }
  }

  return cmds;
}

// ── SCRIPT DETECTION HELPERS ──────────────────────────────────────────────────

function detectScriptParent(code) {
  var c = code || '';
  var first200 = c.slice(0, 200);
  var trimmed = c.trim();
  var typeHint = c.match(/--\s*script_type:\s*(\w+)/i);
  var parentHint = c.match(/--\s*parent:\s*([\w.]+)/i);
  var type = 'Script', parent = 'ServerScriptService';

  var isModule = (
    (/^\s*local\s+\w+\s*=\s*\{\s*\}/.test(trimmed) && /\breturn\s+\w+\s*$/.test(trimmed)) ||
    /^return\s*\{/.test(trimmed) ||
    /^--\s*@?(module|modulescript)/im.test(first200)
  );

  if (isModule) {
    parent = 'ReplicatedStorage';
    type = 'ModuleScript';
  } else if (
    /Players\.LocalPlayer|PlayerGui|LocalUserInputService|UserInputService|StarterPlayerScripts/i.test(c) ||
    (/ScreenGui|StarterGui/i.test(c) && !/ServerScriptService|DataStoreService|PlayerAdded/i.test(c))
  ) {
    if (/ReplicatedFirst|LoadingScreen_Client/i.test(c) || /ReplicatedFirst/i.test(first200)) {
      parent = 'ReplicatedFirst';
      type = 'LocalScript';
    } else if (/StarterCharacterScripts/i.test(c)) {
      parent = 'StarterCharacterScripts';
      type = 'LocalScript';
    } else {
      parent = 'StarterPlayerScripts';
      type = 'LocalScript';
    }
  } else if (
    /DataStoreService|PlayerAdded|OnServerEvent|FireClient|ServerStorage|HttpService:GetAsync/i.test(c)
  ) {
    parent = 'ServerScriptService';
    type = 'Script';
  } else if (/ReplicatedFirst/i.test(first200)) {
    parent = 'ReplicatedFirst';
    type = 'LocalScript';
  } else if (/Players\.LocalPlayer/i.test(first200)) {
    parent = 'StarterPlayerScripts';
    type = 'LocalScript';
  }

  if (typeHint) type = typeHint[1];
  if (parentHint) parent = parentHint[1];
  return { parent: parent, type: type };
}

function makeScriptName(prompt, i, code) {
  if (code) {
    var nm = code.match(/--\s*name:\s*([\w_]+)/i);
    if (nm && nm[1] && nm[1].length > 2) return nm[1];
  }
  var l = (prompt || '').toLowerCase();
  var kw = [
    ['loading', 'LoadingScreen_Client'],
    ['shop gui', 'ShopGUI_Client'],
    ['shop', 'ShopSystem_Server'],
    ['leaderboard', 'Leaderboard_Server'],
    ['admin', 'AdminSystem_Server'],
    ['coin', 'CoinSystem_Server'],
    ['inventory', 'InventorySystem'],
    ['npc', 'NPCBehavior_Server'],
    ['datastore', 'DataStore_Module'],
    ['zombie', 'ZombieAI_Server'],
    ['vehicle', 'VehicleSystem'],
    ['tycoon', 'TycoonPlot'],
    ['round', 'RoundSystem_Server'],
    ['hud', 'HUD_Client'],
    ['gui', 'GUIScript_Client'],
    ['chat', 'ChatSystem_Client'],
    ['badge', 'BadgeManager_Server'],
    ['team', 'TeamSystem_Server'],
  ];
  for (var k = 0; k < kw.length; k++) {
    if (l.includes(kw[k][0])) return kw[k][1] + (i > 0 ? '_' + (i + 1) : '');
  }
  return 'GameScript' + (i > 0 ? '_' + (i + 1) : '');
}

function makeStepLabel(cmd) {
  var a = cmd.action || '', nm = cmd.name || '';
  if (a === 'inject_script')        return 'Create ' + (cmd.script_type || 'Script') + ': ' + (nm || '?');
  if (a === 'create_script')        return 'Create Script: ' + nm;
  if (a === 'create_local_script')  return 'Create LocalScript: ' + nm;
  if (a === 'create_module')        return 'Create ModuleScript: ' + nm;
  if (a === 'edit_script')          return 'Edit Script: ' + nm;
  if (a === 'batch_inject')         return 'Batch inject (' + (cmd.scripts || []).length + ')';
  if (a === 'create_gui')           return 'Create GUI: ' + nm;
  if (a === 'create_frame')         return 'Create Frame: ' + nm;
  if (a === 'get_theme')            return 'Get theme: ' + (cmd.theme || 'nexus_ai');
  if (a === 'apply_theme')          return 'Apply theme: ' + nm;
  if (a === 'create_remote')        return 'Create Remote: ' + nm;
  if (a === 'set_property')         return 'Set property: ' + nm + '.' + (cmd.property || '');
  if (a === 'set_service_property') return 'Set service prop: ' + (cmd.service || nm);
  if (a === 'set_lighting')         return 'Set lighting';
  if (a === 'fill_terrain')         return 'Fill terrain: ' + (cmd.material || '');
  if (a === 'create_part')          return 'Create Part: ' + nm;
  if (a === 'create_npc')           return 'Create NPC: ' + nm;
  if (a === 'delete_object')        return 'Delete: ' + nm;
  if (a === 'batch_commands')       return 'Batch (' + (cmd.commands || []).length + ' cmds)';
  if (a === 'read_script')          return 'Read script: ' + nm;
  if (a === 'scan_workspace' || a === 'request_scan') return 'Scan workspace';
  if (a === 'resolve_mention')      return 'Resolve @' + (cmd.name || cmd.mention || '?');
  if (a === 'play_test' || a === 'run_test') return 'Start play test';
  if (a === 'stop_test')            return 'Stop play test';
  if (a === 'none')                 return null;
  return a + (nm ? ': ' + nm : '');
}

// ── FETCH HELPERS ─────────────────────────────────────────────────────────────

function _sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
function _jitter(ms) { return ms + Math.floor(Math.random() * ms * 0.4); }

function _isAbortError(e) {
  return e && (e.name === 'AbortError' || String(e.message).includes('AbortError'));
}

async function fetchRetry(url, opts, tries) {
  tries = tries || 3;
  if (opts && opts.headers && typeof opts.headers === 'object' && url && url.indexOf('/api/control') !== -1) {
    opts.headers['X-Nexus-Nonce'] = _csrfNonce;
    if (isAdmin() || isOwner()) {
      opts.headers['X-Admin-Token'] = _adminToken || generateAdminToken();
    }
  }
  for (var i = 0; i < tries; i++) {
    try {
      var ctrl = new AbortController();
      var tid = setTimeout(function() { ctrl.abort(); }, 12000);
      var mergedOpts = Object.assign({}, opts, { signal: ctrl.signal });
      var r = await fetch(url, mergedOpts);
      clearTimeout(tid);
      if (r.ok) return r;
      if (r.status === 429) {
        var waitMs = _jitter(3000 * (i + 1));
        toast(curLang === 'id' ? 'Rate limit server, tunggu...' : 'Server rate limit, waiting...', 'var(--yellow)');
        await _sleep(waitMs);
      } else if (r.status >= 500) {
        if (i < tries - 1) await _sleep(_jitter(1000 * (i + 1)));
        else return r;
      } else {
        return r;
      }
    } catch (e) {
      if (_isAbortError(e)) {
        // If caller's signal is aborted, re-throw; otherwise retry
        if (opts && opts.signal && opts.signal.aborted) throw e;
        if (i < tries - 1) { await _sleep(_jitter(800 * (i + 1))); continue; }
        throw e;
      }
      if (i === tries - 1) throw e;
      await _sleep(_jitter(800 * (i + 1)));
    }
  }
  return null;
}

async function safeFetch(bodyData, signal) {
  try {
    // Truncate oversized sources to prevent payload bloat
    if (bodyData && bodyData.command && bodyData.command.source &&
        bodyData.command.source.length > 80000) {
      bodyData = Object.assign({}, bodyData, {
        command: Object.assign({}, bodyData.command, {
          source: bodyData.command.source.slice(0, 80000) + '\n-- [TRUNCATED: script too large]'
        })
      });
    }
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Nonce': _csrfNonce },
      body: JSON.stringify(bodyData)
    };
    if (signal && !signal.aborted) opts.signal = signal;
    var r = await fetch(API_URL, opts);
    return r;
  } catch (e) {
    if (_isAbortError(e)) throw e;
    console.warn('[NEXUS inject] safeFetch error:', e && e.message);
    return null;
  }
}

async function safeFetchWithRetry(bodyData, signal, maxRetries) {
  maxRetries = (maxRetries !== undefined) ? maxRetries : 2;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal && signal.aborted) throw new Error('AbortError');
    try {
      var r = await safeFetch(bodyData, signal);
      if (r) return r;
      if (attempt < maxRetries) {
        await _sleep(_jitter(1000 * (attempt + 1)));
        continue;
      }
      return null;
    } catch (e) {
      if (_isAbortError(e)) throw e;
      if (attempt < maxRetries) {
        await _sleep(_jitter(1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return null;
}

// ── AUTO INJECT TO STUDIO ─────────────────────────────────────────────────────

async function autoInjectToStudio(aiResponse, userPrompt) {
  if (!studioConnected) return null;

  var t = T();
  var summary = [];
  var user = (SESSION ? SESSION.user.username : '').toLowerCase();

  var jsonCmds = parseAllCommands(aiResponse);
  var luaBlocks = parseLuaBlocks(aiResponse);

  if (jsonCmds.length || luaBlocks.length) {
    console.log('[NEXUS inject] Commands:', jsonCmds.length, 'Lua blocks:', luaBlocks.length);
  }

  // Build unified command list
  var allCmds = [];

  jsonCmds.forEach(function(cmd) {
    if (!cmd.action || cmd.action === 'none') return;
    allCmds.push({ type: 'json', cmd: cmd });
  });

  luaBlocks.forEach(function(code, i) {
    var sanR = sanitizeLuaCode(code);
    if (!sanR.ok) return;
    var info = detectScriptParent(sanR.code);
    // Header overrides
    var tm = sanR.code.match(/--\s*script_type:\s*(\w+)/i);
    if (tm) info.type = tm[1];
    var pm = sanR.code.match(/--\s*parent:\s*([\w.]+)/i);
    if (pm) info.parent = pm[1];
    var sName = makeScriptName(userPrompt, i, sanR.code);
    allCmds.push({ type: 'lua', code: sanR.code, info: info, name: sName });
  });

  if (!allCmds.length) {
    console.warn('[NEXUS inject] No commands found in AI response.');
    return null;
  }

  // Optionally append a play test step
  var hasPlayTest = jsonCmds.some(function(c) { return c.action === 'play_test' || c.action === 'run_test'; });
  var hasStopTest = jsonCmds.some(function(c) { return c.action === 'stop_test'; });
  if (S.playTestEnabled && !hasPlayTest && !hasStopTest) {
    allCmds.push({ type: 'playtest' });
  }

  // Build plan steps in the UI
  var planSteps = [];
  allCmds.forEach(function(item) {
    var lbl, sub, meta;
    if (item.type === 'json') {
      lbl = makeStepLabel(item.cmd);
      if (!lbl) return;
      sub = item.cmd.parent || item.cmd.theme || '';
    } else if (item.type === 'lua') {
      lbl = (curLang === 'id' ? 'Buat ' : 'Create ') + item.info.type + ': ' + item.name;
      sub = item.info.parent;
      meta = { code: item.code, name: item.name, parent: item.info.parent, type: item.info.type };
    } else {
      lbl = t.testRunning;
      sub = 'auto play_test';
    }
    var sid = addStep(lbl, 'pending', sub, meta || undefined);
    planSteps.push(Object.assign({}, item, { sid: sid }));
  });

  // Update step counter in UI
  var cntEl = document.getElementById('stepsCount');
  if (cntEl) cntEl.textContent = '(0/' + planSteps.length + ')';

  var doneCount = 0;

  for (var pi = 0; pi < planSteps.length; pi++) {
    var step = planSteps[pi];
    if (!step.sid) { doneCount++; continue; }

    updateStep(step.sid, 'running');
    await _sleep(80);

    // Check for cancellation
    var sig = S.cancelCtrl ? S.cancelCtrl.signal : undefined;
    if (sig && sig.aborted) break;

    // ── Lua script injection ───────────────────────────────────────────────
    if (step.type === 'lua') {
      try {
        var r2 = await safeFetchWithRetry({
          type: 'inject_command',
          command: {
            action: 'inject_script',
            name: step.name,
            parent: step.info.parent,
            script_type: step.info.type,
            source: step.code
          },
          _user: user,
          _target_user: user
        }, sig, 2);

        if (r2 && r2.ok) {
          var rd2;
          try { rd2 = await r2.json(); } catch (je) { rd2 = {}; }
          if (rd2.status === 'ok' || rd2.pushed > 0) {
            updateStep(step.sid, 'done', step.info.type + ': ' + step.name, step.info.parent);
            summary.push(step.info.type + ': ' + step.name);
          } else {
            var rejMsg = (rd2.error || rd2.hint || 'server rejected').slice(0, 80);
            updateStep(step.sid, 'error', rejMsg);
            console.warn('[NEXUS inject] Lua inject rejected:', rd2);
          }
        } else if (r2) {
          var httpErr = 'HTTP ' + r2.status;
          try { var ed2 = await r2.json(); if (ed2 && ed2.error) httpErr = ed2.error.slice(0, 80); } catch (e) {}
          updateStep(step.sid, 'error', httpErr);
        } else {
          updateStep(step.sid, 'error', 'No response (network error)');
        }
      } catch (e) {
        if (_isAbortError(e)) return null;
        updateStep(step.sid, 'error', String(e && e.message || 'unknown').slice(0, 80));
      }

    // ── Play test step ────────────────────────────────────────────────────
    } else if (step.type === 'playtest') {
      try {
        var ptDur = S.playTestDuration || 15;
        await safeFetchWithRetry({
          type: 'batch_commands',
          commands: [{ action: 'play_test', duration: ptDur }],
          _user: user,
          _target_user: user
        }, sig, 1);
        await _sleep(5000);
        updateStep(step.sid, 'done', t.testDone);
      } catch (e) {
        if (_isAbortError(e)) return null;
        updateStep(step.sid, 'error', String(e && e.message || '').slice(0, 80));
      }

    // ── JSON command step ─────────────────────────────────────────────────
    } else {
      var cmd = step.cmd;
      var a = cmd.action || '';
      var cmdToSend = Object.assign({}, cmd);
      // Normalize code -> source
      if (cmdToSend.code && !cmdToSend.source) {
        cmdToSend.source = cmdToSend.code;
        delete cmdToSend.code;
      }

      try {
        var r4 = await safeFetchWithRetry({
          type: 'inject_command',
          command: cmdToSend,
          _user: user,
          _target_user: user
        }, sig, 2);

        if (r4 && r4.ok) {
          var rd4;
          try { rd4 = await r4.json(); } catch (je) { rd4 = {}; }
          if (rd4.status === 'ok' || rd4.pushed > 0) {
            if (a === 'play_test' || a === 'run_test') {
              updateStep(step.sid, 'running', t.testRunning);
              _playTestActive = true;
            } else if (a === 'stop_test') {
              updateStep(step.sid, 'done');
              _playTestActive = false;
            } else if (a === 'read_script' || a === 'scan_workspace' || a === 'request_scan') {
              updateStep(step.sid, 'info');
            } else {
              updateStep(step.sid, 'done');
              var lbl2 = makeStepLabel(cmd);
              if (lbl2) summary.push(lbl2);
            }
          } else {
            var rejMsg2 = (rd4.error || rd4.hint || 'action rejected').slice(0, 80);
            updateStep(step.sid, 'error', rejMsg2);
            console.warn('[NEXUS inject] JSON cmd rejected:', a, rd4);
          }
        } else if (r4) {
          var errTxt = 'HTTP ' + r4.status;
          try { var ed4 = await r4.json(); if (ed4 && ed4.error) errTxt = ed4.error.slice(0, 80); } catch (e) {}
          updateStep(step.sid, 'error', errTxt);
        } else {
          updateStep(step.sid, 'error', 'No response (check network)');
        }
      } catch (e) {
        if (_isAbortError(e)) return null;
        updateStep(step.sid, 'error', String(e && e.message || 'unknown').slice(0, 80));
      }
    }

    doneCount++;
    if (cntEl) cntEl.textContent = '(' + doneCount + '/' + planSteps.length + ')';
    if (pi < planSteps.length - 1) await _sleep(180);
  }

  return summary.length > 0 ? summary : null;
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
var _sysPromptReady=false;
var _sysPromptLoadPromise=null;
function _loadSysPromptScript(){
  if(_sysPromptLoadPromise)return _sysPromptLoadPromise;
  _sysPromptLoadPromise=new Promise(function(resolve){
    if(typeof window.buildSysPrompt==='function'&&window.buildSysPrompt!==_fallbackBuildSysPrompt){_sysPromptReady=true;resolve();return;}
    var script=document.createElement('script');
    script.src='/js/system_prompt.js?_v='+(Date.now()-Date.now()%60000);
    script.async=false;
    script.onload=function(){_sysPromptReady=true;resolve();};
    script.onerror=function(){console.warn('[NEXUS] /js/system_prompt.js gagal dimuat.');resolve();};
    document.head.appendChild(script);
  });
  return _sysPromptLoadPromise;
}
function _fallbackBuildSysPrompt(){return'';}

// ── BUILD API MESSAGES ────────────────────────────────────────────────────────
function buildApiMsgs(){var cv=S.convs.find(function(x){return x.id===S.curConv;});if(!cv)return[];return(cv.msgs||[]).slice(-28).map(function(m){var content=m._rawContent||m.content||'';if(Array.isArray(m.content))return{role:m.role==='user'?'user':'model',content:m.content};return{role:m.role==='user'?'user':'model',content:String(content)};});}
function detectType(txt){var l=txt.toLowerCase();if(/error|fix|bug|debug|broken|crash|not work|tidak bisa|gagal/i.test(l))return'debug';if(/gui|hud|menu|shop|loading|inventory|screen|frame|button|tema|theme/i.test(l))return'gui';if(/read|baca|lihat|cek|check script/i.test(l))return'read';if(/edit|ubah|ganti|update|tambah ke/i.test(l)&&/script/i.test(l))return'edit';if(/test|play|jalankan|run/i.test(l))return'test';return'normal';}

// ── SEND ──────────────────────────────────────────────────────────────────────
async function send(){
  if(S.gen)return;
  var inp=document.getElementById('inp');var txt=(inp?inp.value.trim():'');
  var attachments=S.attachments.slice();
  if(!txt&&!attachments.length)return;
  var t=T();
  if(!checkClientRateLimit('send',20))return;
  if(!isOwner()&&!isAdmin()){var _mc=S.model.cost||0;if(S.credits<=0&&_mc>0){toast(t.creditsExhausted,'var(--pink)');return;}if(_mc>0&&S.credits<_mc){toast((curLang==='id'?'Butuh minimal ':'Need at least ')+_mc+' CR untuk model ini','var(--yellow)');return;}}
  if(!S.curConv)newChat();
  var cv=S.convs.find(function(x){return x.id===S.curConv;});if(!cv)return;
  S.gen=true;
  if(S.cancelCtrl){try{S.cancelCtrl.abort();}catch(ex){}}
  S.cancelCtrl=new AbortController();
  _playTestActive=false;
  var sb=document.getElementById('sendBtn'),cb=document.getElementById('cancelBtn');
  if(sb)sb.classList.add('hidden');if(cb)cb.classList.remove('hidden');
  if(inp){inp.value='';inp.style.height='auto';}
  delete S.draftText[S.curConv];
  var userMsg={role:'user',content:txt,time:Date.now()};
  if(attachments.length)userMsg.attachments=attachments;
  cv.msgs=cv.msgs||[];cv.msgs.push(userMsg);
  appendMsg(userMsg);
  var lastPrompt=txt;S.attachments=[];renderAttachRow();
  if(cv.msgs.length===1)setConvTitle(S.curConv,txt);
  hideMentionDD();
  var showThinking=!isPureGreeting(txt);
  if(showThinking){
    createStepsCard();var rtype=detectType(txt);
    if(rtype==='debug'){addStep(t.readingScript,'running');await _sleep(800);updateStep(1,'done');addStep(t.analyzingError,'running');await _sleep(600);updateStep(2,'done');addStep(t.designingFix,'running');}
    else if(rtype==='gui'){addStep(t.designingUI,'running');await _sleep(500);updateStep(1,'done');addStep(t.buildingComponents,'running');}
    else if(rtype==='read'){addStep(t.readingScript,'running');}
    else if(rtype==='edit'){addStep(t.preparingEdit,'running');}
    else if(rtype==='test'){addStep(t.preparingTest,'running');}
    else{addStep(t.analyzingReq,'running');await _sleep(600);updateStep(1,'done');addStep(t.designingSolution,'running');}
  }
  var msgs=buildApiMsgs();
  if(!_sysPromptReady){await _loadSysPromptScript();}
  var sysPrompt=buildSysPrompt();
  if(_shouldSearchDocs(txt)&&sysPrompt){
    try{var _docsResult=await searchRobloxDocs(txt,5);if(_docsResult){var _docsCtx=_buildDocsContext(_docsResult);if(_docsCtx)sysPrompt=sysPrompt+'\n\n'+_docsCtx;}}
    catch(e){console.warn('[NEXUS] docs pre-search failed:',e&&e.message);}
  }
  var apiMsgs=msgs.slice(0,-1);
  var sysMain=sysPrompt;var sysOverflow='';var SYS_CAP=7500;
  if(sysPrompt&&sysPrompt.length>SYS_CAP){sysMain=sysPrompt.slice(0,SYS_CAP);sysOverflow=sysPrompt.slice(SYS_CAP);var breakAt=sysMain.lastIndexOf('\n');if(breakAt>SYS_CAP*0.8){sysOverflow=sysMain.slice(breakAt)+sysOverflow;sysMain=sysMain.slice(0,breakAt);}}
  if(sysOverflow&&sysOverflow.trim().length>10){apiMsgs=[{role:'user',content:'[SYSTEM CONTEXT CONTINUED]\n'+sysOverflow},{role:'assistant',content:'Understood. I have the complete context.'}].concat(apiMsgs);}
  var lastM={role:'user',content:txt};
  if(attachments.length){var ca=[{type:'text',text:txt}];attachments.forEach(function(a){if(a.type==='image')ca.push({type:'image',source:{type:'base64',media_type:a.mime,data:a.data}});});lastM.content=ca;}
  apiMsgs.push(lastM);
  var aiText='';
  var _localCancelCtrl=S.cancelCtrl;
  try{
    var aiCtrl=new AbortController();var aiTimeoutId=setTimeout(function(){aiCtrl.abort();},90000);
    var _onUserCancel=function(){try{aiCtrl.abort();}catch(ex){}};
    if(_localCancelCtrl&&!_localCancelCtrl.signal.aborted){_localCancelCtrl.signal.addEventListener('abort',_onUserCancel,{once:true});}
    var body={provider:S.model.prov||'gemini',model:S.model.id,messages:apiMsgs,system:sysMain,max_tokens:65536};
    var response=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:aiCtrl.signal});
    clearTimeout(aiTimeoutId);
    if(_localCancelCtrl){try{_localCancelCtrl.signal.removeEventListener('abort',_onUserCancel);}catch(ex){}}
    if(!response.ok){var errData=await response.json().catch(function(){return{};});var errMsg=errData.error||'API error '+response.status;if(response.status===503||(typeof errMsg==='string'&&errMsg.includes('overloaded')))errMsg=t.modelBusyToast+'\n\n'+errMsg;throw new Error(errMsg);}
    var rd=await response.json();if(!validateApiResponse(rd)){throw new Error('Invalid API response');}
    aiText=rd.content||'';
  }catch(e){
    var _userCancelled=_localCancelCtrl&&_localCancelCtrl.signal.aborted;
    if(e.name==='AbortError'||_userCancelled){S.gen=false;S.cancelCtrl=null;_playTestActive=false;if(sb)sb.classList.remove('hidden');if(cb)cb.classList.add('hidden');removeStepsCard();return;}
    var _errTxt=(e.name==='AbortError')?'Request timeout — coba lagi':e.message;
    aiText='**'+t.errorPrefix+'**\n\n'+_errTxt+'\n\n'+(curLang==='id'?'Coba ganti model atau periksa koneksi.':'Try switching model or check your connection.');
  }
  var hasError=aiText&&(aiText.startsWith('**Gagal')||aiText.startsWith('**Failed'));
  if(!isOwner()&&!isAdmin()&&aiText&&!hasError){
    var _cmds=parseAllCommands(aiText);var _luas=parseLuaBlocks(aiText);
    var _numActions=Math.max(1,_cmds.length+_luas.length);var _baseCost=S.model.cost||0;
    var _totalCost=parseFloat((_baseCost*(1+(_numActions-1)*0.1)).toFixed(2));
    S.credits=parseFloat(Math.max(0,S.credits-_totalCost).toFixed(2));updateCreds();
  }
  var studioSummary=null,displayText='';
  if(studioConnected&&!hasError){
    if(showThinking){clearSteps();setStepTitle(t.buildingInStudio);}
    var _preCmds=parseAllCommands(aiText);var _preLuas=parseLuaBlocks(aiText);var _hasAnything=(_preCmds.length>0||_preLuas.length>0);
    if(_hasAnything){studioSummary=await autoInjectToStudio(aiText,lastPrompt);}
    else{
      if(showThinking){finalizeSteps();await _sleep(350);removeStepsCard();}
      displayText=cleanAIResponse(aiText);
      var _noInjectHint=curLang==='id'?'\n\n> ⚠️ Tidak ada script/command yang diinjeksi ke Studio. Coba ulangi permintaan atau switch model.':'\n\n> ⚠️ No scripts/commands were injected to Studio. Try rephrasing or switch model.';
      displayText=displayText+_noInjectHint;
      var aiMsg0={role:'ai',content:displayText,time:Date.now()};aiMsg0._rawContent=aiText;
      cv.msgs.push(aiMsg0);appendMsg(aiMsg0);S.gen=false;S.cancelCtrl=null;
      if(sb)sb.classList.remove('hidden');if(cb)cb.classList.add('hidden');saveS();return;
    }
    displayText=stripAllCode(aiText);
    if(!displayText||displayText.length<20){
      if(studioSummary&&studioSummary.length>0){var _sLines=studioSummary.map(function(s){return'• '+s;}).join('\n');displayText=(curLang==='id'?'Berhasil diinjeksi ke Studio:\n'+_sLines:'Successfully injected to Studio:\n'+_sLines);}
      else{displayText=curLang==='id'?'Proses inject selesai. Cek Explorer di Studio.':'Inject process complete. Check Explorer in Studio.';}
    }
    if(!_playTestActive){if(showThinking){finalizeSteps();await _sleep(500);removeStepsCard();}}
    else{var cd=document.getElementById('stepsCancel');if(cd)cd.remove();}
  }else{
    displayText=cleanAIResponse(aiText);
    if(showThinking){finalizeSteps();await _sleep(350);removeStepsCard();}
  }
  var aiMsg={role:'ai',content:displayText,time:Date.now()};
  if(studioSummary)aiMsg.studioSummary=studioSummary;
  aiMsg._rawContent=aiText;
  cv.msgs.push(aiMsg);appendMsg(aiMsg);
  S.gen=false;S.cancelCtrl=null;
  if(sb)sb.classList.remove('hidden');if(cb)cb.classList.add('hidden');
  saveS();
}

// ── FILE HANDLING ─────────────────────────────────────────────────────────────
function handleFile(e){var files=Array.from(e.target.files||[]);files.forEach(function(file){if(file.type.startsWith('image/')){var reader=new FileReader();reader.onload=function(ev){var d=ev.target.result;S.attachments.push({type:'image',name:file.name,mime:file.type,data:d.split(',')[1],preview:d});renderAttachRow();};reader.readAsDataURL(file);}else{var reader=new FileReader();reader.onload=function(ev){S.attachments.push({type:'file',name:file.name,text:ev.target.result});renderAttachRow();};reader.readAsText(file);}});e.target.value='';}
document.addEventListener('paste',function(e){var items=e.clipboardData&&e.clipboardData.items;if(!items)return;for(var i=0;i<items.length;i++){if(items[i].type.indexOf('image')!==-1){var file=items[i].getAsFile();if(file){var reader=new FileReader();reader.onload=function(ev){var d=ev.target.result;S.attachments.push({type:'image',name:'pasted.png',mime:'image/png',data:d.split(',')[1],preview:d});renderAttachRow();toast(curLang==='id'?'Gambar ditempel!':'Image pasted!','var(--green)',1500);};reader.readAsDataURL(file);e.preventDefault();break;}}}});
function renderAttachRow(){var row=document.getElementById('attachRow');if(!row)return;row.innerHTML=S.attachments.map(function(a,i){if(a.type==='image'){var src=a.preview||('data:'+(a.mime||'image/png')+';base64,'+a.data);return'<div class="attach-item"><img src="'+src+'" alt=""><button class="attach-rm" onclick="removeAttach('+i+')">x</button></div>';}return'<div class="attach-item"><div class="attach-file"><svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>'+esc(a.name)+'</div><button class="attach-rm" onclick="removeAttach('+i+')">x</button></div>';}).join('');}
function removeAttach(i){S.attachments.splice(i,1);renderAttachRow();}
var _inpBox=document.getElementById('inpBox');
if(_inpBox){_inpBox.addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag-over');});_inpBox.addEventListener('dragleave',function(){this.classList.remove('drag-over');});_inpBox.addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag-over');Array.from(e.dataTransfer.files||[]).forEach(function(file){if(file.type.startsWith('image/')){var reader=new FileReader();reader.onload=function(ev){var d=ev.target.result;S.attachments.push({type:'image',name:file.name,mime:file.type,data:d.split(',')[1],preview:d});renderAttachRow();};reader.readAsDataURL(file);}});});}

// ── UI ACTIONS ────────────────────────────────────────────────────────────────
function clearChat(){if(!S.curConv)return;if(!confirm(T().clearConfirm))return;var cv=S.convs.find(function(x){return x.id===S.curConv;});if(cv)cv.msgs=[];renderMsgs([]);saveS();}
function openSettings(){updateCreds();checkDailyCredits();updateRoleDisplay();updatePlayTestUI();document.getElementById('settingsModal').classList.add('show');}
function openAvatarModal(){if(!SESSION)return;var u=SESSION.user;document.getElementById('avatarModalName').textContent='@'+(u.username||'-');document.getElementById('avatarModalImg').src=u.avatar||'nexusai.png';document.getElementById('avatarModalRole').textContent=isOwner()?'Owner':isAdmin()?'Admin':'Roblox Developer';document.getElementById('avatarModalId').textContent='Roblox ID: '+(u.robloxId||'-');document.getElementById('avatarModal').classList.add('show');}
function closeModal(id){var el=document.getElementById(id);if(el)el.classList.remove('show');}
function logout(){localStorage.removeItem('nexus_session');location.replace('/');}
function useSugg(q){var inp=document.getElementById('inp');if(inp){var theme=S.selectedTheme||'nexus_ai';var qWithTheme=theme==='custom'?q.replace(/ Gunakan tema nexus_ai/gi,'').replace(/ Use nexus_ai theme/gi,''):q.replace(/Gunakan tema nexus_ai/gi,'Gunakan tema '+theme).replace(/Use nexus_ai theme/gi,'Use '+theme+' theme');inp.value=qWithTheme;inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,130)+'px';inp.focus();}send();}
function showInstall(){document.getElementById('installModal').classList.add('show');}
function toggleSidebar(){var app=document.getElementById('app'),icon=document.getElementById('collapseSbIcon');app.classList.toggle('sb-hidden');if(icon)icon.innerHTML=app.classList.contains('sb-hidden')?'<polyline points="9 18 15 12 9 6"/>':'<polyline points="15 18 9 12 15 6"/>';}
function switchTab(tab,btn){document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('act');});btn.classList.add('act');var ct=document.getElementById('chatTab'),gt=document.getElementById('guiTab');if(tab==='chat'){ct.style.display='flex';ct.style.flexDirection='column';gt.style.display='none';}else{ct.style.display='none';gt.style.display='flex';gt.style.flexDirection='column';}}
function likeMsg(btn,isLike){var msgEl=btn.closest('.msg.ai');if(!msgEl)return;var lb=msgEl.querySelector('.mab[onclick*="true"]'),db=msgEl.querySelector('.mab[onclick*="false"]');if(isLike){if(lb)lb.classList.toggle('liked');if(db)db.classList.remove('disliked');}else{if(db)db.classList.toggle('disliked');if(lb)lb.classList.remove('liked');}}
function retryMsg(btn){var msgEl=btn.closest('.msg.ai');if(!msgEl)return;var idx=parseInt(msgEl.getAttribute('data-mid'));var cv=S.convs.find(function(x){return x.id===S.curConv;});if(!cv)return;if(idx>0&&cv.msgs[idx-1]&&cv.msgs[idx-1].role==='user'){var inp=document.getElementById('inp');if(inp){inp.value=cv.msgs[idx-1].content;inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,130)+'px';send();}}}
function openShareModal(){var cv=S.convs.find(function(x){return x.id===S.curConv;});if(!cv)return;var text='';(cv.msgs||[]).forEach(function(m){var name=m.role==='user'?('@'+(SESSION&&SESSION.user.username||'You')):'NEXUS AI';var time=m.time?new Date(m.time).toLocaleTimeString(curLang==='id'?'id-ID':'en-US',{hour:'2-digit',minute:'2-digit'}):'';text+='['+time+'] '+name+':\n'+(m.content||'')+'\n\n';});var ta=document.getElementById('shareModalTa');if(ta)ta.value=text;document.getElementById('shareModal').classList.add('show');}
function copyShareText(){var ta=document.getElementById('shareModalTa');if(ta)navigator.clipboard.writeText(ta.value).then(function(){toast(T().copiedToast);});}
async function sendReport(){
  var ta=document.getElementById('reportTa'),btn=document.getElementById('reportBtn'),st=document.getElementById('reportStatus');
  if(!ta||!ta.value.trim())return;
  var cfToken='';
  if(K.turnstile&&window.turnstile&&_turnstileWidget!==null){try{cfToken=await new Promise(function(res,rej){var tid=setTimeout(function(){rej('timeout');},15000);turnstile.getResponse(_turnstileWidget)?(res(turnstile.getResponse(_turnstileWidget)),clearTimeout(tid)):rej('no token');});}catch(e){try{cfToken=await new Promise(function(res){turnstile.reset(_turnstileWidget);setTimeout(function(){res(turnstile.getResponse(_turnstileWidget)||'');},12000);});}catch(e2){cfToken='';}}}
  if(K.turnstile&&!cfToken&&window.turnstile){if(st)st.textContent=curLang==='id'?'Selesaikan CAPTCHA dulu':'Complete CAPTCHA first';return;}
  if(btn)btn.disabled=true;
  try{await fetch(REPORT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:SESSION&&SESSION.user.username||'?',userId:SESSION&&SESSION.user.robloxId||'?',message:ta.value,type:'report','cf-turnstile-response':cfToken,time:new Date().toISOString()})});if(st)st.textContent=curLang==='id'?'Terkirim!':'Sent!';if(ta)ta.value='';if(K.turnstile&&window.turnstile&&_turnstileWidget!==null)turnstile.reset(_turnstileWidget);}
  catch(e){if(st)st.textContent='Error';}
  if(btn)setTimeout(function(){btn.disabled=false;},3000);
}
async function redeemCode(){var inp=document.getElementById('redeemInput'),btn=document.getElementById('redeemBtn'),st=document.getElementById('redeemStatus');if(!inp||!inp.value.trim())return;if(!checkClientRateLimit('redeem',3)){return;}var code=inp.value.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g,'');if(btn)btn.disabled=true;try{var r=await fetch('/api/redeem',{method:'POST',headers:getAdminHeaders(),body:JSON.stringify({code:code,user:(SESSION&&SESSION.user.username||'').toLowerCase(),userId:SESSION&&SESSION.user.robloxId||''})});var d=await r.json();if(d.success){S.credits+=parseFloat(d.credits||0);updateCreds();saveS();if(st)st.textContent='+'+d.credits+' CR';if(inp)inp.value='';}else if(st)st.textContent='Error: '+(d.error||'Invalid');}catch(e){if(st)st.textContent='Error';}if(btn)setTimeout(function(){btn.disabled=false;},3000);}

// ── GUI EDITOR ────────────────────────────────────────────────────────────────
function applyGuiTheme(themeName){if(!themeName||!GUI_THEMES[themeName])return;_curGuiTheme=themeName;var th=GUI_THEMES[themeName];Object.keys(guiElements).forEach(function(id){guiElements[id].bgColor=th.panel;guiElements[id].textColor=th.text;renderGuiEl(id);});var gts=document.getElementById('guiThemeSelect');if(gts)gts.value=themeName;toast(curLang==='id'?'Tema '+themeName+' diterapkan ke elemen!':'Theme '+themeName+' applied to elements!','var(--cyan)',1500);}
function addEl(type){guiElCounter++;var id='el'+guiElCounter;var th=GUI_THEMES[_curGuiTheme]||GUI_THEMES.nexus_ai;var defs={Frame:{w:200,h:120,bgColor:th.panel,text:'',textColor:th.text,cornerRadius:th.corner},TextLabel:{w:160,h:40,bgColor:'transparent',text:'Label',textColor:th.text,fontSize:16,cornerRadius:0},TextButton:{w:140,h:40,bgColor:th.accent,text:'Button',textColor:'#030312',fontSize:14,cornerRadius:th.corner},TextBox:{w:180,h:36,bgColor:th.card,text:'',textColor:th.text,fontSize:13,cornerRadius:th.corner},ImageLabel:{w:80,h:80,bgColor:th.card,text:'',textColor:th.text,cornerRadius:0},ScrollingFrame:{w:200,h:150,bgColor:th.bg,text:'',textColor:th.text,cornerRadius:th.corner}};var def=defs[type]||defs.Frame;guiElements[id]=Object.assign({},def,{id:id,type:type,name:type+'_'+guiElCounter,x:20+guiElCounter*12,y:20+guiElCounter*10});var empt=document.getElementById('guiEmpty');if(empt)empt.style.display='none';renderGuiEl(id);selectEl(id);updateLayerList();}
function renderGuiEl(id){var el=guiElements[id];if(!el)return;var canvas=document.getElementById('guiCanvasInner');if(!canvas)return;var existing=canvas.querySelector('[data-elid="'+id+'"]');if(existing)existing.remove();var div=document.createElement('div');div.className='gui-el';div.setAttribute('data-elid',id);div.style.cssText='left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;background:'+(el.bgColor&&el.bgColor!=='transparent'?el.bgColor:'rgba(30,32,64,0.5)')+';color:'+(el.textColor||'#fff')+';font-size:'+(el.fontSize||14)+'px;border-radius:'+(el.cornerRadius||0)+'px;border:1px solid rgba(0,229,255,0.15);box-shadow:0 2px 8px rgba(0,0,0,.3);';if(el.text){var sp=document.createElement('span');sp.textContent=el.text;sp.style.cssText='pointer-events:none;padding:0 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;';div.appendChild(sp);}div.onmousedown=function(e){startDrag(e,id);};var resize=document.createElement('div');resize.className='gui-resize';resize.onmousedown=function(e){startResize(e,id);};div.appendChild(resize);canvas.appendChild(div);}
function updateLayerList(){var list=document.getElementById('guiLayerList');if(!list)return;var els=Object.values(guiElements);if(!els.length){list.innerHTML='';return;}var typeColors={Frame:'#00e5ff',TextLabel:'#00ffaa',TextButton:'#ff4fa0',TextBox:'#ffd600',ImageLabel:'#cc55ff',ScrollingFrame:'#8800ff'};list.innerHTML=els.map(function(el){var col=typeColors[el.type]||'#888';return'<div class="gui-layer-item'+(el.id===selectedElId?' sel':'')+'" onclick="selectEl(\''+el.id+'\')">'+'<div class="gui-layer-dot" style="background:'+col+';"></div><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:10px;">'+esc(el.name)+'</span></div>';}).join('');}
function selectEl(id){selectedElId=id;document.querySelectorAll('.gui-el').forEach(function(el){el.classList.remove('selected');});var el=document.querySelector('[data-elid="'+id+'"]');if(el)el.classList.add('selected');updatePropsPanel();updateLayerList();}
function updatePropsPanel(){var p=document.getElementById('guiProps');if(!p)return;var t=T();if(!selectedElId||!guiElements[selectedElId]){p.innerHTML='<div style="font-size:10px;color:var(--dim);text-align:center;padding:20px 0;">'+t.guiPropsEmpty+'</div>';return;}var el=guiElements[selectedElId];var sid=selectedElId;p.innerHTML='<div style="font-size:9px;color:var(--cyan);font-family:Orbitron,sans-serif;letter-spacing:1px;margin-bottom:8px;">'+esc(el.type)+'</div>'+'<div class="gui-prop-label">Name</div><input class="gui-prop-input" value="'+esc(el.name||'')+'" onchange="updateElProp(\''+sid+'\',\'name\',this.value)">'+'<div class="gui-prop-label">Text</div><input class="gui-prop-input" value="'+esc(el.text||'')+'" onchange="updateElProp(\''+sid+'\',\'text\',this.value)">'+'<div class="gui-prop-label">Font Size</div><input class="gui-prop-input" type="number" value="'+(el.fontSize||14)+'" min="8" max="72" onchange="updateElProp(\''+sid+'\',\'fontSize\',parseInt(this.value))">'+'<div class="gui-prop-label">BG Color</div><input class="gui-prop-input" type="color" value="'+(el.bgColor&&el.bgColor!=='transparent'?el.bgColor:'#1e2040')+'" onchange="updateElProp(\''+sid+'\',\'bgColor\',this.value)">'+'<div class="gui-prop-label">Text Color</div><input class="gui-prop-input" type="color" value="'+(el.textColor||'#ffffff')+'" onchange="updateElProp(\''+sid+'\',\'textColor\',this.value)">'+'<div class="gui-prop-label">Corner Radius</div><input class="gui-prop-input" type="number" value="'+(el.cornerRadius||0)+'" min="0" max="100" onchange="updateElProp(\''+sid+'\',\'cornerRadius\',parseInt(this.value))">'+'<div class="gui-prop-label">Width</div><input class="gui-prop-input" type="number" value="'+el.w+'" min="20" onchange="resizeElProp(\''+sid+'\',\'w\',parseInt(this.value))">'+'<div class="gui-prop-label">Height</div><input class="gui-prop-input" type="number" value="'+el.h+'" min="10" onchange="resizeElProp(\''+sid+'\',\'h\',parseInt(this.value))">'+'<div class="gui-prop-label">X</div><input class="gui-prop-input" type="number" value="'+el.x+'" onchange="moveElProp(\''+sid+'\',\'x\',parseInt(this.value))">'+'<div class="gui-prop-label">Y</div><input class="gui-prop-input" type="number" value="'+el.y+'" onchange="moveElProp(\''+sid+'\',\'y\',parseInt(this.value))">'+'<button style="margin-top:12px;width:100%;padding:6px;background:rgba(0,229,255,.06);border:1px solid var(--b);border-radius:5px;color:var(--cyan);font-size:10px;cursor:pointer;" onclick="duplicateEl(\''+sid+'\')">'+(curLang==='id'?'Duplikat':'Duplicate')+'</button>'+'<button style="margin-top:5px;width:100%;padding:6px;background:rgba(255,45,107,.08);border:1px solid rgba(255,45,107,.25);border-radius:5px;color:var(--pink);font-size:10px;cursor:pointer;" onclick="deleteEl(\''+sid+'\')">'+(curLang==='id'?'Hapus':'Remove')+'</button>';}
function updateElProp(elId,prop,val){if(!guiElements[elId])return;guiElements[elId][prop]=val;var el=document.querySelector('[data-elid="'+elId+'"]');if(!el)return;if(prop==='text'){var sp=el.querySelector('span');if(sp)sp.textContent=val;else if(val){var s2=document.createElement('span');s2.textContent=val;s2.style.cssText='pointer-events:none;padding:0 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;';el.appendChild(s2);}}if(prop==='bgColor')el.style.background=val;if(prop==='textColor')el.style.color=val;if(prop==='fontSize')el.style.fontSize=val+'px';if(prop==='cornerRadius')el.style.borderRadius=val+'px';if(prop==='name')updateLayerList();}
function resizeElProp(elId,prop,val){if(!guiElements[elId]||isNaN(val)||val<10)return;guiElements[elId][prop]=val;var el=document.querySelector('[data-elid="'+elId+'"]');if(el){if(prop==='w')el.style.width=val+'px';if(prop==='h')el.style.height=val+'px';}}
function moveElProp(elId,prop,val){if(!guiElements[elId]||isNaN(val))return;guiElements[elId][prop]=val;var el=document.querySelector('[data-elid="'+elId+'"]');if(el){if(prop==='x')el.style.left=val+'px';if(prop==='y')el.style.top=val+'px';}}
function duplicateEl(elId){var src=guiElements[elId];if(!src)return;guiElCounter++;var newId='el'+guiElCounter;guiElements[newId]=Object.assign({},src,{id:newId,name:src.name+'_copy',x:src.x+15,y:src.y+15});renderGuiEl(newId);selectEl(newId);updateLayerList();}
function deleteEl(elId){delete guiElements[elId];var el=document.querySelector('[data-elid="'+elId+'"]');if(el)el.remove();selectedElId=null;updatePropsPanel();updateLayerList();if(!Object.keys(guiElements).length){var empt=document.getElementById('guiEmpty');if(empt)empt.style.display='';}}
function clearCanvas(){guiElements={};guiElCounter=0;selectedElId=null;var c=document.getElementById('guiCanvasInner');if(c)c.querySelectorAll('.gui-el').forEach(function(el){el.remove();});var empt=document.getElementById('guiEmpty');if(empt)empt.style.display='';updatePropsPanel();updateLayerList();}
function generateGuiCode(){var t=T();var els=Object.values(guiElements);if(!els.length){toast(t.addElementFirst,'var(--yellow)');return;}function hx(h){var r=(h||'#1e2040').replace('#','');if(r.length<6)return'30,32,64';return parseInt(r.substr(0,2),16)+','+parseInt(r.substr(2,2),16)+','+parseInt(r.substr(4,2),16);}var isID=curLang==='id';var lines=['-- Generated by NEXUS AI UI Editor','-- Theme: '+_curGuiTheme,'-- name: NexusGUI_Client','-- parent: StarterGui','-- script_type: LocalScript','','local Players = game:GetService("Players")','local player = Players.LocalPlayer','local playerGui = player:WaitForChild("PlayerGui")','','local screenGui = Instance.new("ScreenGui")','screenGui.Name = "NexusGUI"','screenGui.DisplayOrder = 999','screenGui.ResetOnSpawn = false','screenGui.IgnoreGuiInset = true','screenGui.Parent = playerGui',''];els.forEach(function(el){var v=el.name.replace(/[^a-zA-Z0-9_]/g,'_');lines.push('');lines.push('local '+v+' = Instance.new("'+el.type+'")');lines.push(v+'.Name = "'+el.name+'"');lines.push(v+'.Size = UDim2.new(0, '+el.w+', 0, '+el.h+')');lines.push(v+'.Position = UDim2.new(0, '+el.x+', 0, '+el.y+')');if(el.bgColor&&el.bgColor!=='transparent')lines.push(v+'.BackgroundColor3 = Color3.fromRGB('+hx(el.bgColor)+')');else lines.push(v+'.BackgroundTransparency = 1');if(el.type!=='Frame'&&el.type!=='ScrollingFrame'&&el.type!=='ImageLabel'){if(el.textColor)lines.push(v+'.TextColor3 = Color3.fromRGB('+hx(el.textColor)+')');lines.push(v+'.Text = "'+String(el.text||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"');if(el.fontSize)lines.push(v+'.TextSize = '+el.fontSize);lines.push(v+'.Font = Enum.Font.GothamBold');lines.push(v+'.TextXAlignment = Enum.TextXAlignment.Center');}lines.push(v+'.BorderSizePixel = 0');if(el.cornerRadius&&el.cornerRadius>0){lines.push('local '+v+'_c = Instance.new("UICorner", '+v+')');lines.push(v+'_c.CornerRadius = UDim.new(0, '+el.cornerRadius+')');}lines.push(v+'.Parent = screenGui');if(el.type==='TextButton'){lines.push('');lines.push(v+'.MouseButton1Click:Connect(function()');lines.push('\tprint("'+el.name+' '+(isID?'diklik':'clicked')+'")');lines.push('end)');}});var out=document.getElementById('guiCodeOutput');if(out)out.textContent=lines.join('\n');document.getElementById('guiCodeModal').classList.add('show');}
function copyGuiCode(){var p=document.getElementById('guiCodeOutput');if(p)navigator.clipboard.writeText(p.textContent).then(function(){toast(T().copiedToast);});}
function downloadGuiCode(){var p=document.getElementById('guiCodeOutput');if(!p)return;var a=document.createElement('a');a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(p.textContent);a.download='NexusGUI.lua';a.click();}
function openGuiAIChat(){document.getElementById('guiAIChatModal').classList.add('show');}
async function generateGuiFromAI(){
  var t=T();var prompt=document.getElementById('guiAIPrompt');if(!prompt||!prompt.value.trim())return;
  var themeSel=document.getElementById('guiAiThemeSelect');var theme=themeSel?themeSel.value:'nexus_ai';
  closeModal('guiAIChatModal');var loading=document.getElementById('guiLoading');if(loading)loading.classList.add('show');
  var th=GUI_THEMES[theme]||GUI_THEMES.nexus_ai;
  try{
    var sysMsg='Output ONLY a valid JSON array. No markdown, no extra text.\nEach item: {"type":"Frame|TextLabel|TextButton|TextBox|ImageLabel|ScrollingFrame","name":"string","x":number,"y":number,"w":number,"h":number,"bgColor":"hex or transparent","textColor":"hex","text":"string","fontSize":number,"cornerRadius":number}\nTheme: '+theme+'. Colors: bg='+th.bg+' panel='+th.panel+' accent='+th.accent+' text='+th.text+'. Canvas: 800x600.';
    var body={provider:S.guiModel.prov||'gemini',model:S.guiModel.id,system:sysMsg,messages:[{role:'user',content:'Create professional Roblox GUI for: '+prompt.value}],max_tokens:3000};
    var r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(r.ok){var d=await r.json();var content=(d.content||'').replace(/```json\n?/gi,'').replace(/```\n?/g,'').trim();
      var jm=content.match(/\[[\s\S]+\]/);
      if(jm){try{var parsed=JSON.parse(jm[0]);clearCanvas();_curGuiTheme=theme;var gts=document.getElementById('guiThemeSelect');if(gts)gts.value=theme;parsed.forEach(function(el){guiElCounter++;var id='el'+guiElCounter;guiElements[id]=Object.assign({id:id,cornerRadius:0,fontSize:14,text:'',bgColor:th.panel,textColor:th.text},el,{w:Math.max(el.w||200,60),h:Math.max(el.h||100,24)});renderGuiEl(id);});var empt=document.getElementById('guiEmpty');if(empt)empt.style.display='none';updateLayerList();toast(curLang==='id'?'UI berhasil dibuat!':'UI built!','var(--green)');}catch(e){toast(t.aiResponseInvalid,'var(--yellow)');}}
      else toast(t.aiResponseInvalid,'var(--yellow)');
    }
  }catch(e){toast('Error: '+(e&&e.message||''),'var(--pink)');}
  if(loading)loading.classList.remove('show');
}
async function sendGuiToPlace(){
  var t=T();if(!studioConnected){toast(t.guiNotConnectedToast,'var(--pink)');return;}
  var els=Object.values(guiElements);if(!els.length){toast(t.addElementFirst,'var(--yellow)');return;}
  function hRgb(h){if(!h||h==='transparent')return[30,32,64];var r=h.replace('#','');if(r.length<6)return[30,32,64];return[parseInt(r.substr(0,2),16),parseInt(r.substr(2,2),16),parseInt(r.substr(4,2),16)];}
  var cmd={action:'create_gui',name:'NexusGUI',parent:'StarterGui',display_order:999,ignore_inset:true,reset_on_spawn:false,theme:_curGuiTheme,elements:els.map(function(el){return{class:el.type,name:el.name,size:[0,el.w,0,el.h],position:[0,el.x,0,el.y],background_color:el.bgColor&&el.bgColor!=='transparent'?hRgb(el.bgColor):[30,32,64],background_transparency:el.bgColor==='transparent'?1:0,text_color:hRgb(el.textColor||'#ffffff'),text:el.text||'',text_size:el.fontSize||14,corner_radius:el.cornerRadius||0,z_index:1};})};
  try{var r=await fetchRetry(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'batch_commands',commands:[cmd],_user:SESSION?SESSION.user.username:'web',target:(SESSION?SESSION.user.username:'').toLowerCase()})},3);var d=await r.json();if(d.pushed>0||d.status==='ok')toast(t.guiSentToast,'var(--green)');else toast(curLang==='id'?'Diantri ke Studio':'Queued to Studio','var(--yellow)');}catch(e){toast('Error: '+(e&&e.message||''),'var(--pink)');}
}
function startDrag(e,elId){if(e.target.classList.contains('gui-resize'))return;e.preventDefault();selectEl(elId);var el=document.querySelector('[data-elid="'+elId+'"]');if(!el)return;var sx=e.clientX,sy=e.clientY,sl=el.offsetLeft,st2=el.offsetTop;function onMove(ev){var nx=Math.max(0,sl+ev.clientX-sx),ny=Math.max(0,st2+ev.clientY-sy);el.style.left=nx+'px';el.style.top=ny+'px';if(guiElements[elId]){guiElements[elId].x=nx;guiElements[elId].y=ny;}}function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);updatePropsPanel();}document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);}
function startResize(e,elId){e.preventDefault();e.stopPropagation();var el=document.querySelector('[data-elid="'+elId+'"]');if(!el)return;var sx=e.clientX,sy=e.clientY,sw=el.offsetWidth,sh=el.offsetHeight;function onMove(ev){var nw=Math.max(40,sw+ev.clientX-sx),nh=Math.max(20,sh+ev.clientY-sy);el.style.width=nw+'px';el.style.height=nh+'px';if(guiElements[elId]){guiElements[elId].w=nw;guiElements[elId].h=nh;}}function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);updatePropsPanel();}document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);}

// ── THEME PICKER ──────────────────────────────────────────────────────────────
var THEME_ACCENTS={nexus_ai:{color:'#00e5ff',color2:'#8800ff',label:'NEXUS AI'},aurora:{color:'#00ffb4',color2:'#00a8ff',label:'Aurora'},candy:{color:'#ff4fa0',color2:'#ff80cc',label:'Candy'},dark:{color:'#aaaaaa',color2:'#444444',label:'Dark'},default:{color:'#0062d0',color2:'#00b4ff',label:'Default'},midnight:{color:'#6644ff',color2:'#aa44ff',label:'Midnight'},studs:{color:'#ff7700',color2:'#ffaa00',label:'Studs'},custom:{color:'#888888',color2:'#555555',label:'Custom (No Theme)'}};
function buildThemeDDHtml(){
  var cur=S.selectedTheme||'nexus_ai';var isID=curLang==='id';
  var html='<div class="theme-dd-title">'+(isID?'Tema GUI':'GUI Theme')+'</div>'+'<div style="font-size:8px;color:var(--dim);padding:0 8px 6px;line-height:1.5;">'+(isID?'Custom = AI buat UI tanpa tema tertentu':'Custom = AI builds UI without a preset theme')+'</div>';
  Object.keys(THEME_ACCENTS).forEach(function(key){
    var th=THEME_ACCENTS[key];var act=key===cur;var guith=GUI_THEMES[key]||GUI_THEMES.nexus_ai;
    var previewHtml=key==='custom'?'<div class="theme-preview" style="align-items:center;justify-content:center;width:32px;"><svg width="16" height="16" viewBox="0 0 24 24" stroke="var(--dim)" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg></div>':'<div class="theme-preview"><span style="background:'+guith.bg+';"></span><span style="background:'+guith.panel+';"></span><span style="background:'+guith.accent+';"></span><span style="background:'+guith.accent2+';"></span></div>';
    var nameStyle=key==='custom'?'style="color:var(--dim);font-style:italic;"':'';
    html+='<div class="theme-opt'+(act?' act':'')+'" data-k="'+key+'" onclick="selectTheme(this.dataset.k)">'+previewHtml+'<span class="theme-opt-name" '+nameStyle+'>'+th.label+'</span>'+(act?'<svg class="theme-opt-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>':'')+'</div>';
  });
  return html;
}
function toggleThemeDD(e){e.stopPropagation();var dd=document.getElementById('themeDD');if(!dd)return;if(dd.classList.contains('open')){dd.classList.remove('open');return;}dd.innerHTML=buildThemeDDHtml();var btn=document.getElementById('themePickerBtn');if(btn){var r=btn.getBoundingClientRect();dd.style.bottom=(window.innerHeight-r.top+4)+'px';dd.style.left=r.left+'px';}dd.classList.add('open');}
function selectTheme(themeName){
  if(!THEME_ACCENTS[themeName])return;S.selectedTheme=themeName;var isCustom=themeName==='custom';
  var swatch=document.getElementById('themeSwatchBtn');var label=document.getElementById('themePickerLabel');var acc=THEME_ACCENTS[themeName];
  if(swatch){if(isCustom){swatch.style.background='transparent';swatch.style.border='1.5px dashed var(--dim)';}else{swatch.style.background=acc.color;swatch.style.border='1px solid rgba(255,255,255,.2)';}}
  if(label)label.textContent=isCustom?(curLang==='id'?'custom':'custom'):themeName;
  var dd=document.getElementById('themeDD');if(dd)dd.classList.remove('open');
  if(Object.keys(guiElements).length>0){applyGuiTheme(themeName);}
  var gts=document.getElementById('guiThemeSelect');if(gts)gts.value=themeName;
  var gats=document.getElementById('guiAiThemeSelect');if(gats)gats.value=themeName;
  var msg=isCustom?(curLang==='id'?'Mode Custom — AI buat UI tanpa tema preset':'Custom mode — AI builds UI freely'):(curLang==='id'?'Tema ':'Theme ')+acc.label+(curLang==='id'?' dipilih!':' selected!');
  toast(msg,'var(--cyan)',2000);saveS();
}
function initThemePicker(){var t=S.selectedTheme||'nexus_ai';var acc=THEME_ACCENTS[t]||THEME_ACCENTS.nexus_ai;var swatch=document.getElementById('themeSwatchBtn');var label=document.getElementById('themePickerLabel');if(swatch){if(t==='custom'){swatch.style.background='transparent';swatch.style.border='1.5px dashed var(--dim)';}else{swatch.style.background=acc.color;swatch.style.border='1px solid rgba(255,255,255,.2)';}}if(label)label.textContent=t;}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function initApp(){
  if(!SESSION)return;
  var t=T();
  _injectSuggChipStyles();
  updateLoader(8,t.loaderInit);
  S.currentProjectId=getProjectIdFromUrl();
  updateLoader(22,t.loaderLoadData);
  await loadS();
  updateLoader(42,t.loaderLoadData);
  if(S.currentProjectId){S.currentProjectName=getProjectName(S.currentProjectId)||null;if(!S.currentProjectName&&SESSION.data&&SESSION.data.projects){var proj=SESSION.data.projects.find(function(x){return x.id===S.currentProjectId;});if(proj)S.currentProjectName=proj.name;}}
  updateProjectUI();
  var u=SESSION.user;
  var av=document.getElementById('sbAv');if(av){av.src=u.avatar||'nexusai.png';av.onerror=function(){this.style.opacity='.4';this.src='';};}
  var unEl=document.getElementById('sbUn');if(unEl)unEl.textContent='@'+(u.username||'-');
  var suEl=document.getElementById('settingsUsername');if(suEl)suEl.textContent='@'+(u.username||'-');
  updateRoleDisplay();updateCreds();updatePlayTestUI();
  updateLoader(58,t.loaderLoadData);
  await _loadSysPromptScript();
  await loadKeys();await loadAdminIds();await loadInboxCount();
  updateLoader(72,t.loaderConnecting);
  applyLang();updateModelUI();
  updateLoader(84,t.loaderConnecting);
  startStudioPoll();startAutoSync();
  updateLoader(93,t.loaderConnecting);
  renderConvs();
  if(S.curConv&&S.convs.some(function(x){return x.id===S.curConv;})){loadConv(S.curConv);}
  else if(S.convs.length>0){var latest=S.convs.reduce(function(a,b){return(b.time||0)>(a.time||0)?b:a;});S.curConv=latest.id;loadConv(S.curConv);}
  else{newChat();}
  checkDailyCredits();
  checkDailyOnLoad();
  initThemePicker();
  updateLoader(100,t.loaderReady);
  setTimeout(hideLoader,500);
  var urlp=new URLSearchParams(window.location.search);
  if(urlp.get('settings')==='true')setTimeout(function(){openSettings();},800);
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.ov').forEach(function(ov){ov.addEventListener('click',function(e){if(e.target===ov)ov.classList.remove('show');});});
var _inpEl=document.getElementById('inp');
if(_inpEl){
  _inpEl.addEventListener('input',function(){
    if(this.value&&this.value.includes('\x00'))this.value=this.value.replace(/\x00/g,'');
    this.style.height='auto';this.style.height=Math.min(this.scrollHeight,130)+'px';saveDraft();
    var val=this.value,pos=this.selectionStart;
    var atIdx=val.lastIndexOf('@',pos-1);
    if(atIdx>=0&&(atIdx===0||/\s/.test(val[atIdx-1]))){var afterAt=val.slice(atIdx+1,pos);if(!afterAt.includes(' ')){_mentionActive=true;_mentionAtPos=atIdx;showMentionDD(afterAt);return;}}
    hideMentionDD();
  });
  _inpEl.addEventListener('keydown',function(e){
    if(_mentionActive){if(e.key==='ArrowUp'){e.preventDefault();moveMentionSel(-1);return;}if(e.key==='ArrowDown'){e.preventDefault();moveMentionSel(1);return;}if(e.key==='Enter'||e.key==='Tab'){if(selectCurrentMention()){e.preventDefault();return;}}if(e.key==='Escape'){hideMentionDD();return;}}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!S.gen)send();}
  });
  _inpEl.addEventListener('blur',function(){setTimeout(hideMentionDD,200);});
}
window.addEventListener('click',function(e){
  var mdd=document.getElementById('mDD');if(mdd&&!mdd.contains(e.target)){var btn=document.getElementById('inpModelBtn');if(!btn||!btn.contains(e.target))mdd.classList.remove('open');}
  var gmdd=document.getElementById('guiMDD');if(gmdd&&!gmdd.contains(e.target)){var gbtn=document.getElementById('guiModelBtn');if(!gbtn||!gbtn.contains(e.target))gmdd.classList.remove('open');}
  var mdd2=document.getElementById('mentionDD');if(mdd2&&!mdd2.contains(e.target)&&e.target!==_inpEl)hideMentionDD();
  var tdd=document.getElementById('themeDD');if(tdd&&!tdd.contains(e.target)){var tbtn=document.getElementById('themePickerBtn');if(!tbtn||!tbtn.contains(e.target))tdd.classList.remove('open');}
});
window.addEventListener('beforeunload',function(){
  if(_syncDebounceTimer){clearTimeout(_syncDebounceTimer);_syncDebounceTimer=null;}
  saveS();
});
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();newChat();}
  if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();openSettings();}
});
initApp();