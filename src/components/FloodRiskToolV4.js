import { useState, useCallback } from "react";

const FLOOD_REPORT_API_URL = "/api/flood-risk-report";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SMARTY_AUTH_ID = process.env.REACT_APP_SMARTY_AUTH_ID || "";
const SMARTY_AUTH_TOKEN = process.env.REACT_APP_SMARTY_AUTH_TOKEN || "";

// ─── SEASONAL URGENCY ────────────────────────────────────────────────────────
function getSeasonalAlert() {
  const now = new Date();
  const year = now.getFullYear();
  const events = [
    { name: "Atlantic Hurricane Season",  start: new Date(year, 5, 1),  color: "#c0392b", icon: "🌀" },
    { name: "Spring Flood Season",         start: new Date(year, 2, 15), color: "#1068a0", icon: "🌧️" },
    { name: "Midwest Storm Season",        start: new Date(year, 3, 1),  color: "#8e44ad", icon: "⛈️" },
    { name: "Pacific Storm Season",        start: new Date(year, 9, 15), color: "#2471a3", icon: "🌊" },
  ];
  let nearest = null, minDays = Infinity;
  events.forEach(ev => {
    let start = new Date(ev.start);
    if (start < now) start.setFullYear(year + 1);
    const days = Math.ceil((start - now) / 86400000);
    if (days < minDays) { minDays = days; nearest = { ...ev, days }; }
  });
  return nearest;
}

// ─── DIY CATEGORIES ──────────────────────────────────────────────────────────
const DIY_CATS = [
  {
    id: "diversion", icon: "🌊", title: "Water Diversion",
    url: "https://oiriunu.com/flood-solutions/water-diversion/",
    tagline: "Stop water before it reaches your home",
    desc: "Redirect surface water and runoff away from your foundation. The most cost-effective first line of defence — often preventing the need for more expensive interior solutions.",
    products: ["Extended downspouts", "Yard regrading", "French drains", "Rain gardens"],
    baseSaving: 4200,
  },
  {
    id: "entry", icon: "🚪", title: "Entry Point Protection",
    url: "https://oiriunu.com/flood-solutions/entry-point-protection/",
    tagline: "Seal every path water could use to enter",
    desc: "Water exploits gaps around doors, windows, and foundation cracks. Targeted sealing and barriers can dramatically reduce water intrusion with minimal disruption.",
    products: ["Door flood shields", "Window well covers", "Foundation crack seal kits"],
    baseSaving: 3100,
  },
  {
    id: "removal", icon: "⚡", title: "Water Removal",
    url: "https://oiriunu.com/flood-solutions/water-removal/",
    tagline: "When water gets in, remove it fast",
    desc: "Automatic pumping systems ensure any water that enters is evacuated quickly — minimising damage to floors, walls, and valuables by reducing standing time.",
    products: ["Primary sump pumps", "Battery backup pumps", "Portable utility pumps"],
    baseSaving: 5800,
  },
  {
    id: "infrastructure", icon: "🔧", title: "Infrastructure Protection",
    url: "https://oiriunu.com/flood-solutions/infrastructure-protection/",
    tagline: "Protect your home's vital systems",
    desc: "HVAC, electrical panels, and sewer lines are extremely expensive to repair after flooding. Guard your infrastructure at the source before a storm event.",
    products: ["Backwater valves", "Raised utility platforms"],
    baseSaving: 6500,
  },
  {
    id: "barriers", icon: "🛡️", title: "Emergency Barriers",
    url: "https://oiriunu.com/flood-solutions/emergency-barriers/",
    tagline: "Rapid deployment when storms threaten",
    desc: "Keep deployable flood barriers on hand for fast protection during storm events. Modern solutions are lightweight, reusable, and highly effective for rapid deployment.",
    products: ["Absorbent flood bags", "Modular perimeter barriers"],
    baseSaving: 2400,
  },
];


// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;0,700;1,600&family=Source+Sans+3:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#093d5e;--blue:#1068a0;--sky:#2e9fd4;--teal:#0c8c7a;--green:#18a868;
  --mint:#ccf0e4;--skylt:#daeef8;--mist:#edf5fa;--cloud:#f5f9fc;--white:#fff;
  --border:#c6dce9;--text:#1b3244;--sub:#527088;
  --shadow:0 2px 16px rgba(9,61,94,.09);--shadowM:0 6px 32px rgba(9,61,94,.13);--shadowL:0 12px 52px rgba(9,61,94,.16);
  --r:12px;
}
.fra{width:100%;min-height:100vh;background:var(--cloud);font-family:'Source Sans 3',sans-serif;color:var(--text);font-size:15px;line-height:1.55;}

/* ── URGENCY BANNER ── */
.urgency{display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 20px;font-size:13px;font-weight:700;color:#fff;letter-spacing:.02em;text-align:center;flex-wrap:wrap;}
.urgency-countdown{background:rgba(0,0,0,.25);padding:3px 10px;border-radius:20px;font-family:'Source Sans 3',monospace;font-size:12px;font-weight:700;}

/* ── HERO ── */
.hero{width:100%;background:linear-gradient(145deg,#082d46 0%,#0d5c85 55%,#0b7a6a 100%);padding:clamp(28px,5vw,56px) clamp(16px,4vw,40px) clamp(44px,7vw,72px);position:relative;overflow:hidden;text-align:center;}
.hero::after{content:'';position:absolute;bottom:-2px;left:0;right:0;height:48px;background:var(--cloud);clip-path:ellipse(55% 100% at 50% 100%);}
.hbadge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);padding:5px 16px;border-radius:20px;margin-bottom:16px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.82);}
.hdot{width:7px;height:7px;border-radius:50%;background:#7ef0c0;animation:blink 2s ease-in-out infinite;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
.hero h1{font-family:'Lora',serif;font-size:clamp(26px,5.5vw,56px);font-weight:700;color:#fff;line-height:1.1;margin-bottom:12px;}
.hero h1 em{font-style:italic;color:#7ef0c0;}
.hero p{font-size:clamp(13px,2vw,16px);color:rgba(255,255,255,.68);max-width:500px;margin:0 auto;font-weight:300;}

/* ── PROGRESS BAR ── */
.progress-wrap{max-width:820px;margin:0 auto;padding:0 clamp(12px,3vw,28px);position:relative;z-index:3;margin-top:-12px;}
.progress-card{background:var(--white);border-radius:10px;border:1px solid var(--border);box-shadow:var(--shadow);padding:14px 20px;margin-bottom:0;}
.progress-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.progress-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--sub);}
.progress-pct{font-size:12px;font-weight:700;color:var(--blue);}
.progress-track{height:6px;background:#e0eaf2;border-radius:3px;overflow:hidden;}
.progress-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--blue),var(--teal));transition:width .5s cubic-bezier(.4,0,.2,1);}
.progress-steps{display:flex;justify-content:space-between;margin-top:8px;}
.ps{font-size:10px;color:#b0c8d8;font-weight:600;transition:color .3s;}
.ps.active{color:var(--blue);}
.ps.done{color:var(--teal);}

/* ── MAIN ── */
.main{width:100%;max-width:820px;margin:0 auto;padding:16px clamp(12px,3vw,28px) 60px;position:relative;z-index:2;}

/* ── CARD ── */
.card{background:var(--white);border-radius:var(--r);border:1px solid var(--border);box-shadow:var(--shadowL);overflow:hidden;margin-bottom:18px;}
.card-hd{background:linear-gradient(90deg,var(--skylt),var(--mint));padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;}
.card-hd-title{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--navy);}
.card-body{padding:clamp(16px,3vw,26px);}

/* ── FORM ── */
.fg{display:flex;flex-direction:column;gap:13px;}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:13px;}
@media(max-width:500px){.frow{grid-template-columns:1fr;}}
.frow3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:13px;}
@media(max-width:600px){.frow3{grid-template-columns:1fr 1fr;}}
@media(max-width:380px){.frow3{grid-template-columns:1fr;}}
.fld{display:flex;flex-direction:column;gap:5px;}
label{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--sub);}
label .req{color:var(--teal);}
input,select{border:1.5px solid var(--border);border-radius:8px;padding:10px 13px;font-size:14px;color:var(--text);font-family:'Source Sans 3',sans-serif;background:var(--cloud);outline:none;transition:border-color .2s,box-shadow .2s;width:100%;-webkit-appearance:none;}
input::placeholder{color:#adc4d4;}
input:focus,select:focus{border-color:var(--sky);box-shadow:0 0 0 3px rgba(46,159,212,.14);background:var(--white);}
input.err-field,select.err-field{border-color:#d04040;}
.err{font-size:11px;color:#c03030;font-weight:600;margin-top:3px;}
.odiv{display:flex;align-items:center;gap:10px;margin:2px 0;}
.oline{flex:1;height:1px;background:var(--border);}
.olabel{font-size:10px;color:#a0baca;letter-spacing:.09em;text-transform:uppercase;font-weight:700;white-space:nowrap;}

/* radio group */
.radio-group{display:flex;gap:8px;flex-wrap:wrap;}
.radio-opt{display:flex;align-items:center;gap:7px;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;transition:all .2s;background:var(--cloud);font-size:13px;font-weight:500;color:var(--sub);}
.radio-opt:hover{border-color:var(--sky);background:var(--skylt);}
.radio-opt.selected{border-color:var(--teal);background:var(--mint);color:var(--navy);}
.radio-opt input[type=radio]{display:none;}

.btn-go{width:100%;padding:15px;border:none;border-radius:9px;background:linear-gradient(130deg,var(--blue) 0%,var(--teal) 100%);font-family:'Source Sans 3',sans-serif;font-size:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#fff;cursor:pointer;transition:opacity .2s,transform .1s;box-shadow:0 4px 18px rgba(17,104,160,.32);}
.btn-go:hover{opacity:.91;} .btn-go:active{transform:scale(.99);}
.trow{display:flex;justify-content:center;flex-wrap:wrap;gap:16px;padding:13px 24px;border-top:1px solid var(--border);background:var(--cloud);}
.ti{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--sub);font-weight:600;}
.tck{color:var(--teal);}

/* ── ADDR STATUS ── */
.addr-status{display:flex;align-items:center;gap:8px;font-size:12px;padding:7px 12px;border-radius:7px;margin-top:6px;font-weight:600;}
.addr-ok{background:#e8faf2;color:#0c7a54;border:1px solid #a0dfc0;}
.addr-bad{background:#fff3e0;color:#a05000;border:1px solid #f0c070;}
.addr-chk{background:var(--skylt);color:var(--blue);border:1px solid var(--border);}
.zip-note{background:var(--skylt);border:1px solid var(--border);border-radius:8px;padding:11px 14px;font-size:13px;color:var(--blue);margin-top:6px;line-height:1.5;}

/* ── LOADING ── */
.loading-wrap{background:var(--white);border-radius:var(--r);border:1px solid var(--border);box-shadow:var(--shadowL);padding:clamp(36px,6vw,60px) 32px;text-align:center;}
.waver{display:flex;align-items:flex-end;justify-content:center;gap:5px;height:44px;margin-bottom:28px;}
.wb{width:5px;border-radius:3px;background:linear-gradient(to top,var(--teal),var(--sky));animation:wv 1.1s ease-in-out infinite;}
.wb:nth-child(2){animation-delay:.1s}.wb:nth-child(3){animation-delay:.2s}.wb:nth-child(4){animation-delay:.3s}
.wb:nth-child(5){animation-delay:.4s}.wb:nth-child(6){animation-delay:.3s}.wb:nth-child(7){animation-delay:.2s}
@keyframes wv{0%,100%{height:10px;opacity:.4}50%{height:40px;opacity:1}}
.loading-wrap h2{font-family:'Lora',serif;font-size:clamp(18px,3vw,24px);color:var(--navy);margin-bottom:6px;}
.loading-wrap p{font-size:13px;color:var(--sub);font-weight:300;margin-bottom:24px;}
.steps{display:flex;flex-direction:column;gap:7px;max-width:300px;margin:0 auto;text-align:left;}
.stp{display:flex;align-items:center;gap:9px;font-size:13px;color:#b0c8d8;transition:color .4s;font-weight:500;}
.stp.act{color:var(--blue);} .stp.don{color:var(--teal);}
.sic{width:16px;text-align:center;font-size:13px;}

/* ── RESULTS ── */
.results{animation:fadeUp .5s ease forwards;}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

/* score hero */
.sh{border-radius:var(--r);overflow:hidden;box-shadow:var(--shadowL);margin-bottom:18px;}
.sh-top{padding:clamp(20px,4vw,34px) clamp(18px,4vw,30px) clamp(16px,3vw,26px);background:linear-gradient(140deg,var(--navy) 0%,#0e6394 100%);position:relative;}
.sh-top::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
.tl .sh-top::before{background:linear-gradient(90deg,#128a4a,#7ef0c0);}
.tm .sh-top::before{background:linear-gradient(90deg,#a07800,#f0cc44);}
.th .sh-top::before{background:linear-gradient(90deg,#b05000,#f09044);}
.ts .sh-top::before{background:linear-gradient(90deg,#900000,#e04040);}
.sh-greet{font-size:13px;color:rgba(255,255,255,.6);margin-bottom:2px;font-weight:300;}
.sh-addr{font-size:12px;color:rgba(255,255,255,.42);margin-bottom:16px;}
.sh-flex{display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap;}
.sh-num{font-family:'Lora',serif;font-size:clamp(64px,12vw,90px);line-height:1;color:#fff;font-weight:700;}
.sh-den{font-size:20px;color:rgba(255,255,255,.3);vertical-align:super;line-height:3.5;}
.sh-right{flex:1;min-width:140px;}
.tp{display:inline-block;padding:4px 13px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;}
.tl .tp{background:rgba(126,240,192,.2);color:#7ef0c0;border:1px solid rgba(126,240,192,.4);}
.tm .tp{background:rgba(240,204,68,.2);color:#f0cc44;border:1px solid rgba(240,204,68,.4);}
.th .tp{background:rgba(240,144,68,.2);color:#f09044;border:1px solid rgba(240,144,68,.4);}
.ts .tp{background:rgba(224,64,64,.2);color:#e04040;border:1px solid rgba(224,64,64,.4);}
.sh-desc{font-size:13px;color:rgba(255,255,255,.68);line-height:1.55;font-weight:300;}
.sh-bar{height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:16px;overflow:hidden;}
.sh-fill{height:100%;border-radius:2px;transition:width 1.4s cubic-bezier(.16,1,.3,1);}
.tl .sh-fill{background:linear-gradient(90deg,#128a4a,#7ef0c0);}
.tm .sh-fill{background:linear-gradient(90deg,#a07800,#f0cc44);}
.th .sh-fill{background:linear-gradient(90deg,#b05000,#f09044);}
.ts .sh-fill{background:linear-gradient(90deg,#900000,#e04040);}

/* share buttons */
.share-row{display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid rgba(255,255,255,.1);flex-wrap:wrap;}
.share-label{font-size:11px;color:rgba(255,255,255,.5);font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-right:4px;}
.share-btn{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;transition:opacity .2s;text-decoration:none;}
.share-btn:hover{opacity:.85;}
.sb-fb{background:#1877f2;color:#fff;}
.sb-tw{background:#1da1f2;color:#fff;}
.sb-li{background:#0a66c2;color:#fff;}
.sb-cp{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);}

/* bullets */
.sh-body{background:var(--white);padding:clamp(16px,3vw,24px) clamp(18px,4vw,30px);}
.rlist{display:flex;flex-direction:column;gap:11px;}
.ri{display:flex;gap:13px;align-items:flex-start;}
.ric{flex-shrink:0;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;}
.geo{background:var(--skylt);} .hist{background:var(--mint);} .clim{background:#fff3d4;}
.rt{font-size:13px;line-height:1.6;color:var(--sub);padding-top:3px;}
.rt strong{color:var(--navy);}

/* section */
.sec{background:var(--white);border-radius:var(--r);border:1px solid var(--border);box-shadow:var(--shadow);margin-bottom:18px;overflow:hidden;}
.sec-hd{padding:14px 22px;border-bottom:1px solid var(--border);background:var(--cloud);display:flex;align-items:center;gap:9px;}
.sec-ico{font-size:17px;}
.sec-title{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--navy);}
.sec-body{padding:clamp(16px,3vw,22px);}

/* financial */
.fin-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px;margin-bottom:16px;}
@media(max-width:440px){.fin-grid{grid-template-columns:1fr;}}
.fbox{border-radius:9px;padding:13px 15px;border:1px solid;}
.fb-r{border-color:#f5baba;background:#fff5f5;}
.fb-o{border-color:#f0d8a0;background:#fffbf0;}
.fb-b{border-color:var(--border);background:var(--skylt);}
.fb-g{border-color:#a8e4c4;background:#f0faf5;}
.flbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px;}
.fb-r .flbl{color:#b03030;} .fb-o .flbl{color:#9a5a00;} .fb-b .flbl{color:var(--blue);} .fb-g .flbl{color:var(--teal);}
.famt{font-family:'Lora',serif;font-size:clamp(18px,3.5vw,24px);font-weight:700;color:var(--navy);line-height:1.1;}
.fnote{font-size:11px;color:var(--sub);margin-top:3px;}
.fnarr{font-size:13px;line-height:1.7;color:var(--sub);background:var(--mist);border-radius:8px;padding:13px 15px;border-left:3px solid var(--sky);}

/* ── COST CALCULATOR ── */
.calc-wrap{background:linear-gradient(135deg,#f0f8ff 0%,#e8faf2 100%);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;}
.calc-title{font-family:'Lora',serif;font-size:17px;color:var(--navy);margin-bottom:4px;font-weight:600;}
.calc-sub{font-size:12px;color:var(--sub);margin-bottom:16px;}
.calc-sliders{display:flex;flex-direction:column;gap:14px;margin-bottom:18px;}
.slider-item{display:flex;flex-direction:column;gap:5px;}
.slider-label{display:flex;justify-content:space-between;align-items:center;}
.sl-name{font-size:12px;font-weight:700;color:var(--navy);}
.sl-val{font-size:13px;font-weight:700;color:var(--blue);}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;background:linear-gradient(90deg,var(--sky) var(--pct,50%),#d0e8f4 var(--pct,50%));outline:none;border:none;box-shadow:none;padding:0;cursor:pointer;}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:var(--blue);cursor:pointer;border:2px solid #fff;box-shadow:0 1px 6px rgba(16,104,160,.3);}
.calc-results{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
@media(max-width:500px){.calc-results{grid-template-columns:1fr;}}
.cr-box{border-radius:8px;padding:12px 14px;text-align:center;}
.cr-box.cr-cost{background:#fff3f3;border:1px solid #f5baba;}
.cr-box.cr-save{background:#f0faf5;border:1px solid #a8e4c4;}
.cr-box.cr-roi{background:var(--skylt);border:1px solid var(--border);}
.cr-lbl{font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px;}
.cr-cost .cr-lbl{color:#b03030;} .cr-save .cr-lbl{color:var(--teal);} .cr-roi .cr-lbl{color:var(--blue);}
.cr-num{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--navy);}
.cr-note{font-size:10px;color:var(--sub);margin-top:2px;}

/* DIY categories */
.cat-grid{display:flex;flex-direction:column;gap:12px;}
.cat{border:1.5px solid var(--border);border-radius:11px;overflow:hidden;transition:box-shadow .2s,border-color .2s;}
.cat:hover{box-shadow:var(--shadowM);border-color:var(--sky);}
.cat-top{display:flex;align-items:center;gap:14px;padding:14px 17px;background:linear-gradient(90deg,var(--skylt) 0%,var(--white) 100%);text-decoration:none;}
.cat-ico{font-size:22px;flex-shrink:0;}
.cat-info{flex:1;}
.cat-title{font-family:'Lora',serif;font-size:15px;font-weight:600;color:var(--navy);line-height:1.2;}
.cat-tagline{font-size:12px;color:var(--teal);font-weight:600;margin-top:1px;}
.cat-arrow{font-size:18px;color:var(--sky);transition:transform .2s;}
.cat:hover .cat-arrow{transform:translateX(4px);}
.cat-body{padding:12px 17px 15px;border-top:1px solid var(--border);background:var(--white);}
.cat-desc{font-size:13px;color:var(--sub);line-height:1.6;margin-bottom:9px;}
.cat-saving{display:inline-flex;align-items:center;gap:7px;background:#f0faf5;border:1px solid #a8e4c4;border-radius:7px;padding:6px 12px;margin-bottom:10px;}
.cat-saving-ico{font-size:14px;}
.cat-saving-text{font-size:12px;font-weight:700;color:var(--teal);}
.cat-pills{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.cpill{font-size:11px;font-weight:600;background:var(--mint);color:var(--teal);padding:3px 10px;border-radius:20px;}
.cat-cta{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--blue);text-decoration:none;padding:7px 13px;background:var(--skylt);border-radius:7px;transition:background .2s,color .2s;}
.cat-cta:hover{background:var(--blue);color:var(--white);}

/* pro services */
.pro-list{display:flex;flex-direction:column;gap:10px;}
.pro-item{border:1px solid var(--border);border-radius:9px;padding:13px 15px;display:flex;gap:13px;align-items:flex-start;transition:box-shadow .2s;background:var(--white);}
.pro-item:hover{box-shadow:var(--shadow);border-color:var(--sky);}
.pro-ico{flex-shrink:0;width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;background:var(--skylt);}
.pro-name{font-weight:700;font-size:14px;color:var(--navy);margin-bottom:2px;}
.pro-desc{font-size:12px;color:var(--sub);line-height:1.5;margin-bottom:6px;}
.pro-meta{display:flex;flex-wrap:wrap;gap:7px;}
.ptag{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 9px;border-radius:20px;}
.pt-c{background:#e4f2ff;color:var(--blue);} .pt-i{background:var(--mint);color:var(--teal);} .pt-t{background:#fff4e0;color:#9a6800;}

/* nurture sequence */
.nurture-list{display:flex;flex-direction:column;gap:0;}
.nurture-item{display:flex;gap:14px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--border);}
.nurture-item:last-child{border-bottom:none;}
.nurture-day{flex-shrink:0;width:48px;height:48px;border-radius:9px;background:linear-gradient(135deg,var(--blue),var(--teal));display:flex;flex-direction:column;align-items:center;justify-content:center;}
.nd-num{font-family:'Lora',serif;font-size:16px;font-weight:700;color:#fff;line-height:1;}
.nd-lbl{font-size:9px;color:rgba(255,255,255,.7);font-weight:700;text-transform:uppercase;}
.nurture-content{flex:1;}
.nurture-subject{font-size:13px;font-weight:700;color:var(--navy);margin-bottom:2px;}
.nurture-type{font-size:11px;color:var(--teal);font-weight:600;}

/* lead CTA */
.lead-banner{background:linear-gradient(135deg,var(--navy) 0%,var(--teal) 100%);border-radius:var(--r);padding:clamp(22px,4vw,34px);text-align:center;box-shadow:var(--shadowL);margin-bottom:18px;}
.lead-banner h2{font-family:'Lora',serif;font-size:clamp(18px,4vw,28px);color:#fff;margin-bottom:7px;}
.lead-banner p{font-size:14px;color:rgba(255,255,255,.68);margin-bottom:20px;line-height:1.6;font-weight:300;max-width:460px;margin-left:auto;margin-right:auto;}
.lform{display:flex;flex-direction:column;gap:9px;max-width:460px;margin:0 auto;}
.lrow{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
@media(max-width:460px){.lrow{grid-template-columns:1fr;}}
.li{background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.25);border-radius:8px;padding:10px 13px;font-size:13px;color:#fff;font-family:'Source Sans 3',sans-serif;outline:none;width:100%;transition:border-color .2s;}
.li::placeholder{color:rgba(255,255,255,.38);}
.li:focus{border-color:rgba(255,255,255,.6);background:rgba(255,255,255,.18);}
.ls2{background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.25);border-radius:8px;padding:10px 13px;font-size:13px;color:#fff;font-family:'Source Sans 3',sans-serif;outline:none;width:100%;-webkit-appearance:none;}
.ls2 option{background:#0a3d5e;color:#fff;}
.btn-lead{padding:13px;border:none;border-radius:9px;background:linear-gradient(135deg,#7ef0c0,#2e9fd4);font-family:'Source Sans 3',sans-serif;font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--navy);cursor:pointer;transition:opacity .2s;box-shadow:0 4px 14px rgba(0,0,0,.22);}
.btn-lead:hover{opacity:.9;}
.lprivacy{font-size:11px;color:rgba(255,255,255,.38);margin-top:5px;}
.lsuccess{background:rgba(126,240,192,.15);border:1px solid rgba(126,240,192,.38);border-radius:10px;padding:18px;}
.lsuccess h3{font-family:'Lora',serif;font-size:19px;color:#7ef0c0;margin-bottom:5px;}
.lsuccess p{font-size:13px;color:rgba(255,255,255,.65);font-weight:300;}

.btn-reset{display:block;margin:4px auto 0;background:none;border:1.5px solid var(--border);padding:8px 22px;border-radius:8px;font-family:'Source Sans 3',sans-serif;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--sub);cursor:pointer;transition:all .2s;}
.btn-reset:hover{border-color:var(--sky);color:var(--blue);}

.copied-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:1000;animation:toastin .3s ease;}
@keyframes toastin{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const tierCls   = s => s < 25 ? "tl" : s < 50 ? "tm" : s < 75 ? "th" : "ts";
const tierLabel = s => s < 25 ? "Low Risk" : s < 50 ? "Moderate Risk" : s < 75 ? "High Risk" : "Severe Risk";
const fmt       = n => "$" + Math.round(n).toLocaleString();

const LOAD_STEPS = [
  "Locating parcel & FEMA zone data…",
  "Modelling elevation profile…",
  "Cross-referencing NOAA rainfall data…",
  "Querying 50-year disaster records…",
  "Running climate projections…",
  "Building your personalised report…",
];

const FORM_STEPS = ["Your Details","Property Info","Property Condition"];

// ─── ADDRESS VALIDATION ───────────────────────────────────────────────────────
async function validateAddress(street, city, state, zip) {
  try {
    const q = new URLSearchParams({ street, city, state, zipcode: zip, "auth-id": SMARTY_AUTH_ID, "auth-token": SMARTY_AUTH_TOKEN });
    const res = await fetch(`https://us-street.api.smartystreets.com/street-address?${q}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const c = data[0].components, md = data[0].metadata;
      return { valid: true, standardized: data[0].delivery_line_1 + ", " + data[0].last_line, zip5: c.zipcode, city: c.city_name, state: c.state_abbreviation, lat: md.latitude, lng: md.longitude };
    }
    return { valid: false };
  } catch { return { valid: true, standardized: `${street}, ${city}, ${state} ${zip}`, zip5: zip }; }
}

async function validateByZip(zip) {
  try {
    const q = new URLSearchParams({ zipcode: zip, "auth-id": SMARTY_AUTH_ID, "auth-token": SMARTY_AUTH_TOKEN });
    const res = await fetch(`https://us-zipcode.api.smartystreets.com/lookup?${q}`);
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.cities?.length) return { valid: true, city: data[0].cities[0].city, state: data[0].cities[0].state_abbreviation };
    return { valid: false };
  } catch { return { valid: true, city: "your area", state: "" }; }
}

// ─── CALCULATOR COMPONENT ────────────────────────────────────────────────────
function CostCalculator({ score }) {
  const base = score || 50;
  const [mitigPct, setMitigPct] = useState(60);
  const [propVal,  setPropVal]  = useState(350);
  const [years,    setYears]    = useState(10);

  const annualRisk   = Math.round(base * 180);
  const mitigCost    = Math.round((mitigPct / 100) * annualRisk * 1.8);
  const annualSaved  = Math.round((mitigPct / 100) * annualRisk);
  const totalSaved   = annualSaved * years;
  const netSaving    = totalSaved - mitigCost;
  const valProtected = Math.round(propVal * 1000 * 0.06);
  const roi          = mitigCost > 0 ? Math.round((netSaving / mitigCost) * 100) : 0;

  const sliderStyle = pct => ({ "--pct": pct + "%" });

  return (
    <div className="calc-wrap">
      <div className="calc-title">Before vs. After Mitigation Calculator</div>
      <div className="calc-sub">Adjust the sliders to model your potential savings</div>
      <div className="calc-sliders">
        <div className="slider-item">
          <div className="slider-label">
            <span className="sl-name">Mitigation coverage level</span>
            <span className="sl-val">{mitigPct}%</span>
          </div>
          <input type="range" min="10" max="95" value={mitigPct} style={sliderStyle(((mitigPct-10)/85)*100)}
            onChange={e => setMitigPct(Number(e.target.value))} />
        </div>
        <div className="slider-item">
          <div className="slider-label">
            <span className="sl-name">Property value</span>
            <span className="sl-val">${propVal}k</span>
          </div>
          <input type="range" min="100" max="1500" step="25" value={propVal} style={sliderStyle(((propVal-100)/1400)*100)}
            onChange={e => setPropVal(Number(e.target.value))} />
        </div>
        <div className="slider-item">
          <div className="slider-label">
            <span className="sl-name">Planning horizon</span>
            <span className="sl-val">{years} years</span>
          </div>
          <input type="range" min="1" max="20" value={years} style={sliderStyle(((years-1)/19)*100)}
            onChange={e => setYears(Number(e.target.value))} />
        </div>
      </div>
      <div className="calc-results">
        <div className="cr-box cr-cost">
          <div className="cr-lbl">Mitigation Investment</div>
          <div className="cr-num">{fmt(mitigCost)}</div>
          <div className="cr-note">One-time cost estimate</div>
        </div>
        <div className="cr-box cr-save">
          <div className="cr-lbl">Total Savings ({years}yr)</div>
          <div className="cr-num">{fmt(Math.max(0, netSaving))}</div>
          <div className="cr-note">Net after mitigation cost</div>
        </div>
        <div className="cr-box cr-roi">
          <div className="cr-lbl">Return on Investment</div>
          <div className="cr-num">{Math.max(0,roi)}%</div>
          <div className="cr-note">+ {fmt(valProtected)} value protected</div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function normalizeAssessmentResult(raw, form, locationLabel) {
  const data = raw && typeof raw === "object" ? raw : {};
  const score = Number.isFinite(Number(data.score)) ? Math.max(0, Math.min(100, Math.round(Number(data.score)))) : 62;
  const tier = data.tier || (score >= 85 ? "Severe" : score >= 65 ? "High" : score >= 40 ? "Moderate" : "Low");
  const fallbackLocation = data.locationLabel || locationLabel || [form.city, form.state].filter(Boolean).join(", ") || form.zip || "your area";

  return {
    score,
    tier,
    locationLabel: fallbackLocation,
    bullets: {
      geographic: data?.bullets?.geographic || "Localized runoff, drainage overload, and stormwater concentration can create flood exposure even outside the highest mapped flood zones.",
      historical: data?.bullets?.historical || "Past severe-rain and flood events in the broader region suggest repeat exposure risk should be taken seriously.",
      climate: data?.bullets?.climate || "Rainfall intensity is increasing in many regions, which raises short-duration flooding and drainage stress over time."
    },
    financial: {
      annualRisk: data?.financial?.annualRisk || "$4,000–$14,000",
      fiveYearNoAction: data?.financial?.fiveYearNoAction || "$20,000–$70,000",
      propertyValueImpact: data?.financial?.propertyValueImpact || "-3% to -8%",
      insurancePremiumRange: data?.financial?.insurancePremiumRange || "$1,600–$4,800/yr",
      narrative: data?.financial?.narrative || "Without mitigation, repeated water intrusion can damage structures, finishes, contents, and mechanical systems while also affecting insurability and resale perception."
    },
    diyCategories: Array.isArray(data.diyCategories) && data.diyCategories.length ? data.diyCategories : ["diversion", "entry", "removal", "infrastructure", "barriers"],
    catSavings: data?.catSavings && typeof data.catSavings === "object" ? data.catSavings : {
      diversion: 4200,
      entry: 2800,
      removal: 5300,
      infrastructure: 6700,
      barriers: 2400
    },
    proServices: Array.isArray(data.proServices) && data.proServices.length ? data.proServices : [
      { icon: "🔧", name: "French Drain System", desc: "Redirects groundwater and surface water away from the foundation.", cost: "$3,000–$9,000", impact: "Very High", time: "2–3 days" },
      { icon: "🏗️", name: "Foundation Waterproofing", desc: "Adds a dedicated waterproof barrier to reduce seepage risk.", cost: "$6,000–$18,000", impact: "Very High", time: "3–5 days" },
      { icon: "🔍", name: "Professional Risk Assessment", desc: "Provides property-specific mitigation priorities and next steps.", cost: "$500–$1,500", impact: "High", time: "Half day" }
    ]
  };
}
function Toast({ show, message }) {
  if (!show) return null;

  return (
    <div className="copied-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

function trackEvent(eventName, payload = {}) {
  try {
    if (window.gtag) {
      window.gtag("event", eventName, payload);
    }

    if (window.dataLayer) {
      window.dataLayer.push({
        event: eventName,
        ...payload,
      });
    }

    console.log("Analytics event:", eventName, payload);
  } catch (err) {
    console.error("Analytics tracking failed:", err);
  }
}
export default function FloodRiskApp() {
  const seasonalAlert = getSeasonalAlert();

  // form state
const [form, setForm] = useState({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine: "",
  city: "",
  state: "",
  zip: "",
  yearBuilt: "",
  propertyType: "",
  basement: "",
  treesOverhang: "",
  priorFloodDamage: "",
  drainageIssues: "",
  interest: "Full Professional Assessment"
});
  const [addrMode,    setAddrMode]    = useState("full");
  const [addrStatus,  setAddrStatus]  = useState(null);
  const [addrVerified,setAddrVerified]= useState(null);
  const [errs,        setErrs]        = useState({});

  // multi-step progress
  const [formStep, setFormStep] = useState(0); // 0,1,2

  // app phase
  const [phase,   setPhase]   = useState("form");
  const [stepIdx, setStepIdx] = useState(0);
  const [doneSet, setDoneSet] = useState([]);
  const [result,  setResult]  = useState(null);
  const [barW,    setBarW]    = useState(0);

  // lead / share
  const [lead,     setLead]     = useState({ name:"", phone:"", interest:"Full Professional Assessment" });
  const [leadDone, setLeadDone] = useState(false);
  const [copied,   setCopied]   = useState(false);

  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // progress %
  const fields0 = [form.firstName, form.lastName, form.email].filter(Boolean).length;
  const fields1 = [form.zip, form.yearBuilt, form.propertyType, form.basement].filter(Boolean).length;
  const fields2 = [form.treesOverhang, form.priorFloodDamage, form.drainageIssues].filter(Boolean).length;
  const totalFilled = fields0 + fields1 + fields2;
  const totalFields = 3 + 4 + 3;
  const progressPct = Math.round((totalFilled / totalFields) * 100);

  // Address check
  const checkAddress = useCallback(async () => {
    if (!form.addressLine || !form.zip) return;
    setAddrStatus("checking");
    const res = await validateAddress(form.addressLine, form.city, form.state, form.zip);
    if (res.valid) { setAddrStatus("ok"); setAddrVerified(res); }
    else { setAddrStatus("bad"); setAddrVerified(null); }
  }, [form.addressLine, form.city, form.state, form.zip]);

  // Validate current step
  const validateStep = step => {
    const e = {};
  if (step === 0) {
  if (!form.firstName.trim()) e.firstName = "Required";
  if (!form.lastName.trim()) e.lastName = "Required";
  if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = "Valid email required";
}
    if (step === 1) {
      if (addrMode === "full") {
        if (!form.addressLine.trim()) e.addressLine = "Required";
        if (!form.zip.trim()) e.zip = "Required";
      } else {
        if (!form.zip.trim() || form.zip.trim().length < 5) e.zip = "Valid 5-digit ZIP required";
      }
    }
    if (step === 2) {
      if (!form.treesOverhang) e.treesOverhang = "Required";
      if (!form.priorFloodDamage) e.priorFloodDamage = "Required";
      if (!form.drainageIssues) e.drainageIssues = "Required";
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const nextStep = () => {
  if (validateStep(formStep)) {
    trackEvent("flood_assessment_step_completed", {
      step: formStep + 1,
      stepName: FORM_STEPS[formStep]
    });
    setFormStep(s => Math.min(2, s + 1));
  } else {
    trackEvent("flood_assessment_step_validation_failed", {
      step: formStep + 1,
      stepName: FORM_STEPS[formStep]
    });
  }
};
  const prevStep = () => setFormStep(s => Math.max(0, s-1));

  const handleSubmit = async () => {
  if (!validateStep(2)) return;

trackEvent("flood_assessment_submit_started", {
  addrMode,
  zip: form.zip || "",
  hasAddress: Boolean(form.addressLine),
  hasYearBuilt: Boolean(form.yearBuilt),
  hasPropertyType: Boolean(form.propertyType),
  hasBasement: Boolean(form.basement)
});

  setPhase("loading");
  setDoneSet([]);
  setStepIdx(0);

  let location =
    addrMode === "full"
      ? (addrVerified?.standardized || `${form.addressLine}, ${form.city}, ${form.state} ${form.zip}`)
      : `ZIP Code ${form.zip}`;

  let zipCity = addrVerified?.city || form.city;
  let zipState = addrVerified?.state || form.state;

  if (addrMode === "zip") {
    const zRes = await validateByZip(form.zip);
    if (zRes.valid) {
      zipCity = zRes.city;
      zipState = zRes.state;
    }
    location = `${zipCity}, ${zipState} ${form.zip}`;
  }

  const [aiRes] = await Promise.all([
    (async () => {
      try {
        const res = await fetch(FLOOD_REPORT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ form: { ...form }, location })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || "Failed to generate report");
        return normalizeAssessmentResult(d, form, location);
      } catch (err) {
        console.error("Flood report generation failed:", err);
        return normalizeAssessmentResult(null, form, location);
      }
    })(),
  ]);

  setResult({ ...aiRes, location, zip: form.zip });

  const payload = {
    requirePhone: false,
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    streetAddress: form.addressLine || "",
    city: zipCity || form.city || "",
    state: zipState || form.state || "",
    zipCode: form.zip || "",
    yearBuilt: form.yearBuilt,
    fullName: `${form.firstName} ${form.lastName}`,
    propertyType:
      form.propertyType === "Condo / Townhome"
        ? "Condo / Townhouse"
        : form.propertyType,
    basementType:
      form.basement === "Yes — Full finished basement"
        ? "Yes – Full finished basement"
        : form.basement === "Yes — Unfinished basement"
        ? "Yes - Unfinished basement"
        : form.basement === "Yes — Partial / crawlspace"
        ? "Yes- Partial / crawlspace"
        : form.basement,
    treesOverhang: form.treesOverhang,
    priorFloodDamage: form.priorFloodDamage,
    drainageIssues: form.drainageIssues,
    interestArea: form.interest ? [form.interest] : ["General Information"],
    riskScore: aiRes?.score ?? null,
    assessmentAnswers: {
      addrMode,
      location,
      addressLine: form.addressLine || "",
      city: zipCity || form.city || "",
      state: zipState || form.state || "",
      zip: form.zip || "",
      propertyType: form.propertyType,
      basement: form.basement,
      treesOverhang: form.treesOverhang,
      priorFloodDamage: form.priorFloodDamage,
      drainageIssues: form.drainageIssues,
      interest: form.interest || "",
      tier: aiRes?.tier || "",
      locationLabel: aiRes?.locationLabel || location,
      reportSummary: aiRes?.financial?.narrative || ""
    },
    utm: {
      source: new URLSearchParams(window.location.search).get("utm_source"),
      medium: new URLSearchParams(window.location.search).get("utm_medium"),
      campaign: new URLSearchParams(window.location.search).get("utm_campaign"),
      term: new URLSearchParams(window.location.search).get("utm_term"),
      content: new URLSearchParams(window.location.search).get("utm_content")
    }
  };

  try {
    const response = await fetch("/api/assessment-submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const submitResult = await response.json();

    if (!response.ok) {
      throw new Error(submitResult.error || "Submission failed");
    }

    console.log("Assessment submit success:", submitResult);
    trackEvent("flood_assessment_result_viewed", {
  score: aiRes?.score ?? null,
  tier: aiRes?.tier || "",
  zip: form.zip || "",
  location: location || ""
});

setLead({
  name: `${form.firstName} ${form.lastName}`.trim(),
  phone: "",
  interest: form.interest || "Full Professional Assessment"
});

    setPhase("result");
    setTimeout(() => setBarW(aiRes.score), 150);
  } catch (err) {
    console.error("Assessment submit failed:", err);
    window.alert(err.message || "Something went wrong while saving your assessment.");
    setPhase("result");
    setTimeout(() => setBarW(aiRes.score), 150);
  }
};
  const handleLeadSubmit = async () => {
  if (!lead.name || !lead.phone) return;

  const parts = lead.name.trim().split(" ");

  const payload = {
    firstName: parts[0] || form.firstName,
    lastName: parts.slice(1).join(" ") || form.lastName,
    email: form.email,
    phone: lead.phone,
    streetAddress: form.addressLine || "",
    city: form.city || "",
    state: form.state || "",
    zipCode: form.zip || "",
    yearBuilt: form.yearBuilt,
    fullName: lead.name,
    propertyType:
      form.propertyType === "Condo / Townhome"
        ? "Condo / Townhouse"
        : form.propertyType,
    basementType:
      form.basement === "Yes — Full finished basement"
        ? "Yes – Full finished basement"
        : form.basement === "Yes — Unfinished basement"
        ? "Yes - Unfinished basement"
        : form.basement === "Yes — Partial / crawlspace"
        ? "Yes- Partial / crawlspace"
        : form.basement,
    treesOverhang: form.treesOverhang,
    priorFloodDamage: form.priorFloodDamage,
    drainageIssues: form.drainageIssues,
    interestArea: lead.interest ? [lead.interest] : ["General Information"],
    riskScore: result?.score ?? null,
    assessmentAnswers: {
      source: "lead_followup",
      location: result?.location || ""
    }
  };

  try {
    const response = await fetch("/api/assessment-submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const submitResult = await response.json();

if (!response.ok) {
  throw new Error(submitResult.error || "Lead submission failed");
}

setLeadDone(true);
trackEvent("flood_assessment_lead_submitted", {
  score: result?.score ?? null,
  tier: result?.tier || "",
  interest: lead.interest || "General Information",
  zip: form.zip || ""
});
  } catch (err) {
    console.error("Lead submit failed:", err);
    alert(err.message || "Something went wrong.");
  }
};

const handleShare = async platform => {
  const score = result?.score || 0;
  const tier = tierLabel(score);
  const text = `My home just scored ${score}/100 on the Flood Risk Assessment — ${tier}. Find out your risk at oiriunu.com`;

  const urls = {
    fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://oiriunu.com")}&quote=${encodeURIComponent(text)}`,
    tw: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    li: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://oiriunu.com")}&summary=${encodeURIComponent(text)}`
  };

  if (platform === "copy") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      trackEvent("flood_report_share_copy", {
        score,
        tier,
        location: result?.location || "",
        method: "copy_link"
      });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Copy failed:", err);
      trackEvent("flood_report_share_copy_failed", {
        score,
        tier,
        location: result?.location || "",
        method: "copy_link"
      });
    }
   } else {
    trackEvent("flood_report_share_click", {
      score,
      tier,
      platform,
      location: result?.location || ""
    });

    window.open(urls[platform], "_blank", "width=600,height=400");
  }
};

  const reset = () => { setPhase("form"); setResult(null); setBarW(0); setAddrStatus(null); setAddrVerified(null); setAddrMode("full"); setLead({name:"",phone:"",interest:"Full Professional Assessment"}); setLeadDone(false); setErrs({}); setFormStep(0); };

  const tc = result ? tierCls(result.score) : "";
  const hasBasement = form.basement && form.basement !== "No basement";
  const activeCats  = result ? DIY_CATS.filter(c => !result.diyCategories || result.diyCategories.includes(c.id)) : DIY_CATS;

  // Radio helper
  const RadioGroup = ({ field, options }) => (
    <div className="radio-group">
      {options.map(opt => (
        <label key={opt} className={`radio-opt${form[field]===opt?" selected":""}`}>
          <input type="radio" name={field} value={opt} checked={form[field]===opt} onChange={()=>set(field,opt)} />
          {opt}
        </label>
      ))}
    </div>
  );

  return (
    <>
      <style>{S}</style>

      {/* URGENCY BANNER */}
      {seasonalAlert && (
  <div className="urgency" style={{ background: seasonalAlert.color }}>
    <span>{seasonalAlert.icon}</span>
    <span><strong>{seasonalAlert.name}</strong> begins in</span>
    <span className="urgency-countdown">{seasonalAlert.days} days</span>
          <span>— Is your home protected?</span>
        </div>
      )}

      <div className="fra">
        <div className="hero">
          <div className="hbadge"><div className="hdot"/>Flood Risk Intelligence</div>
          <h1>Is Your Home at Risk<br/>from <em>Flooding?</em></h1>
          <p>Get your free personalised flood risk score — with financial impact study, savings calculator, and tailored protection solutions.</p>
        </div>

        {/* PROGRESS BAR */}
        {phase === "form" && (
          <div className="progress-wrap">
            <div className="progress-card">
              <div className="progress-header">
                <span className="progress-label">Assessment progress — Step {formStep+1} of {FORM_STEPS.length}</span>
                <span className="progress-pct">{progressPct}% complete</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(4, ((formStep / (FORM_STEPS.length-1))*100))}%` }}/>
              </div>
              <div className="progress-steps">
                {FORM_STEPS.map((s,i) => (
                  <span key={s} className={`ps ${i < formStep ? "done" : i===formStep ? "active" : ""}`}>
                    {i < formStep ? "✓ " : ""}{s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="main">
          {/* ── FORM ── */}
          {phase === "form" && (
            <div className="card">
              <div className="card-hd">
                <span>{["👤","🏠","🌿"][formStep]}</span>
                <span className="card-hd-title">{FORM_STEPS[formStep]}</span>
              </div>
              <div className="card-body">

{/* STEP 0 — Identity */}
{formStep === 0 && (
  <div className="fg">
    <div className="frow">
      <div className="fld">
        <label>First Name <span className="req">*</span></label>
        <input
          placeholder="Jane"
          value={form.firstName}
          className={errs.firstName ? "err-field" : ""}
          onChange={e => set("firstName", e.target.value)}
        />
        {errs.firstName && <div className="err">{errs.firstName}</div>}
      </div>

      <div className="fld">
        <label>Last Name <span className="req">*</span></label>
        <input
          placeholder="Smith"
          value={form.lastName}
          className={errs.lastName ? "err-field" : ""}
          onChange={e => set("lastName", e.target.value)}
        />
        {errs.lastName && <div className="err">{errs.lastName}</div>}
      </div>
    </div>

    <div className="fld">
      <label>Email Address <span className="req">*</span></label>
      <input
        type="email"
        placeholder="jane@example.com"
        value={form.email}
        className={errs.email ? "err-field" : ""}
        onChange={e => set("email", e.target.value)}
      />
      {errs.email && <div className="err">{errs.email}</div>}
    </div>

    <div style={{ display: "flex", gap: 10 }}>
      <button className="btn-go" style={{ flex: 1 }} onClick={nextStep}>
        Continue →
      </button>
    </div>
  </div>
)}
                {/* STEP 1 — Property */}
                {formStep === 1 && (
                  <div className="fg">
                    {addrMode === "full" ? (
                      <>
                        <div className="fld">
                          <label>Street Address <span className="req">*</span></label>
                          <input placeholder="123 Main Street" value={form.addressLine} className={errs.addressLine?"err-field":""} onChange={e=>set("addressLine",e.target.value)} onBlur={checkAddress}/>
                          {addrStatus==="checking" && <div className="addr-status addr-chk">🔍 Verifying with USPS…</div>}
                          {addrStatus==="ok" && <div className="addr-status addr-ok">✓ Verified: {addrVerified?.standardized}</div>}
                          {addrStatus==="bad" && <div className="addr-status addr-bad">⚠ Not found. <button onClick={()=>{setAddrMode("zip");setAddrStatus(null);}} style={{background:"none",border:"none",color:"#0068a0",cursor:"pointer",fontWeight:700,textDecoration:"underline",fontSize:"12px",padding:0}}>Use ZIP only →</button></div>}
                          {errs.addressLine && <div className="err">{errs.addressLine}</div>}
                        </div>
                        <div className="frow">
                          <div className="fld"><label>City</label><input placeholder="Springfield" value={form.city} onChange={e=>set("city",e.target.value)} onBlur={checkAddress}/></div>
                          <div className="fld"><label>State</label><input placeholder="IL" maxLength={2} value={form.state} onChange={e=>set("state",e.target.value.toUpperCase())} onBlur={checkAddress}/></div>
                        </div>
                      </>
                    ) : (
                      <div className="fld">
                        <label>ZIP Code <span className="req">*</span></label>
                        <div className="zip-note">📍 Address not verified — we'll run your full analysis using your ZIP code. You may enter a street address below for records.</div>
                        <input placeholder="Street address (optional)" value={form.addressLine} onChange={e=>set("addressLine",e.target.value)} style={{marginBottom:8}}/>
                      </div>
                    )}
                    <div className="fld">
                      <label>ZIP Code <span className="req">*</span></label>
                      <input placeholder="62701" maxLength={5} value={form.zip} className={errs.zip?"err-field":""} onChange={e=>set("zip",e.target.value)} onBlur={checkAddress}/>
                      {errs.zip && <div className="err">{errs.zip}</div>}
                    </div>
                    <div className="odiv"><div className="oline"/><span className="olabel">Improves accuracy</span><div className="oline"/></div>
                    <div className="frow">
                      <div className="fld">
                        <label>Year Built</label>
                        <input placeholder="e.g. 1988" value={form.yearBuilt} onChange={e=>set("yearBuilt",e.target.value)}/>
                      </div>
                      <div className="fld">
                        <label>Property Type</label>
                        <select value={form.propertyType} onChange={e=>set("propertyType",e.target.value)}>
                          <option value="">Select…</option>
                          <option>Single Family Home</option><option>Condo / Townhome</option>
                          <option>Multi-Family</option><option>Commercial</option>
                        </select>
                      </div>
                    </div>
                    <div className="fld">
                      <label>Basement?</label>
                      <select value={form.basement} onChange={e=>set("basement",e.target.value)}>
                        <option value="">Unknown</option>
                        <option>Yes — Full finished basement</option><option>Yes — Unfinished basement</option>
                        <option>Yes — Partial / crawlspace</option><option>No basement</option>
                      </select>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn-go" style={{background:"var(--cloud)",color:"var(--sub)",border:"1.5px solid var(--border)",boxShadow:"none",flex:"0 0 auto",width:"auto",padding:"12px 20px"}} onClick={prevStep}>← Back</button>
                      <button className="btn-go" style={{flex:1}} onClick={nextStep}>Continue →</button>
                    </div>
                  </div>
                )}

                {/* STEP 2 — Condition */}
                {formStep === 2 && (
                  <div className="fg">
                    <div style={{background:"var(--skylt)",borderRadius:8,padding:"12px 15px",fontSize:13,color:"var(--blue)",marginBottom:4,fontWeight:500}}>
                      💡 These details significantly personalise your report. Take 30 seconds — it's worth it.
                    </div>
                    <div className="fld">
                      <label>Do trees overhang your roof or gutters?</label>
                      <RadioGroup field="treesOverhang" options={["Yes","No","Not sure"]}/>
                      {form.treesOverhang === "Yes" && <div style={{fontSize:12,color:"var(--teal)",marginTop:4,fontWeight:600}}>🌳 Noted — blocked gutters are a leading cause of preventable water damage</div>}
                    </div>
                    <div className="fld">
                      <label>Has the property had flood or water damage before?</label>
                      <RadioGroup field="priorFloodDamage" options={["Yes","No","Not sure"]}/>
                    </div>
                    <div className="fld">
                      <label>Do you notice water pooling or drainage issues near the property?</label>
                      <RadioGroup field="drainageIssues" options={["Yes","No","Sometimes"]}/>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn-go" style={{background:"var(--cloud)",color:"var(--sub)",border:"1.5px solid var(--border)",boxShadow:"none",flex:"0 0 auto",width:"auto",padding:"12px 20px"}} onClick={prevStep}>← Back</button>
                      <button className="btn-go" style={{flex:1}} onClick={handleSubmit}>Generate My Free Flood Risk Report →</button>
                    </div>
                  </div>
                )}
<div className="trow">
  {["USPS Verified","FEMA Data","NOAA Rainfall","50-yr History","100% Free"].map(t => (
    <div className="ti" key={t}>
      <span className="tck">✓</span>{t}
    </div>
  ))}
</div>
              </div>
            </div>
          )}
          {/* ── LOADING ── */}
          {phase === "loading" && (
            <div className="loading-wrap">
              <div className="waver">{[1,2,3,4,5,6,7].map(i=><div className="wb" key={i}/>)}</div>
              <h2>Analysing {form.zip || "your area"}…</h2>
              <p>Pulling data from FEMA, NOAA, and 50 years of disaster records.</p>
              <div className="steps">
                {LOAD_STEPS.map((s,i)=>(
                  <div key={i} className={`stp ${doneSet.includes(i)?"don":stepIdx===i?"act":""}`}>
                    <span className="sic">{doneSet.includes(i)?"✓":stepIdx===i?"›":"·"}</span>{s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {phase === "result" && result && (
            <div className={`results ${tc}`}>
              {/* Score hero */}
              <div className="sh">
                <div className="sh-top">
                  <div className="sh-greet">Hi {form.firstName}, here is your personalised flood risk snapshot</div>
                  <div className="sh-addr">📍 {result.location}</div>
                  <div className="sh-flex">
                    <div><div className="sh-num">{result.score}<span className="sh-den">/100</span></div></div>
                    <div className="sh-right">
                      <div className="tp">{tierLabel(result.score)}</div>
                      <div className="sh-desc">
                        {result.score < 25 && `${form.firstName}, your property shows low flood exposure. Staying informed and maintaining drainage remains important.`}
                        {result.score >= 25 && result.score < 50 && `${form.firstName}, moderate exposure detected. Proactive steps now can prevent significantly costlier damage later.`}
                        {result.score >= 50 && result.score < 75 && `${form.firstName}, elevated flood risk detected. Without protective measures, significant structural and financial damage is possible.`}
                        {result.score >= 75 && `${form.firstName}, severe flood risk identified. We strongly recommend reviewing mitigation options and insurance coverage right away.`}
                      </div>
                    </div>
                  </div>
                  <div className="sh-bar"><div className="sh-fill" style={{width:`${barW}%`}}/></div>
                </div>

                {/* SHARE ROW */}
                <div className="share-row" style={{background:"rgba(0,0,0,.2)"}}>
                  <span className="share-label">Share your score:</span>
                  <button className="share-btn sb-fb" onClick={()=>handleShare("fb")}>f Facebook</button>
                  <button className="share-btn sb-tw" onClick={()=>handleShare("tw")}>𝕏 Twitter</button>
                  <button className="share-btn sb-li" onClick={()=>handleShare("li")}>in LinkedIn</button>
                  <button className="share-btn sb-cp" onClick={()=>handleShare("copy")}>📋 Copy link</button>
                </div>

                <div className="sh-body">
                  <div className="rlist">
                    <div className="ri"><div className="ric geo">🗺️</div><div className="rt"><strong>Geographic:</strong> {result.bullets.geographic}</div></div>
                    <div className="ri"><div className="ric hist">📋</div><div className="rt"><strong>Historical:</strong> {result.bullets.historical}</div></div>
                    <div className="ri"><div className="ric clim">🌡️</div><div className="rt"><strong>Climate Trend:</strong> {result.bullets.climate}</div></div>
                    {form.treesOverhang === "Yes" && <div className="ri"><div className="ric" style={{background:"#f0fae8"}}>🌳</div><div className="rt"><strong>Gutter Risk:</strong> Overhanging trees increase debris blockage risk — a common trigger for preventable water intrusion at roof level and along foundations.</div></div>}
                    {form.priorFloodDamage === "Yes" && <div className="ri"><div className="ric" style={{background:"#fff0f0"}}>⚠️</div><div className="rt"><strong>Prior Damage:</strong> Properties with a history of flood damage face statistically higher repeat event risk and may face insurance loading.</div></div>}
                    {(form.drainageIssues === "Yes" || form.drainageIssues === "Sometimes") && <div className="ri"><div className="ric" style={{background:"#fff8e0"}}>💧</div><div className="rt"><strong>Drainage:</strong> Existing pooling or drainage issues indicate the current landscape is not directing water away effectively — a key risk multiplier.</div></div>}
                  </div>
                </div>
              </div>

              {/* Financial Impact */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">💰</span><span className="sec-title">Financial Impact — If You Don't Act</span></div>
                <div className="sec-body">
                  <div className="fin-grid">
                    <div className="fbox fb-r"><div className="flbl">Est. Annual Loss Exposure</div><div className="famt">{result.financial.annualRisk}</div><div className="fnote">Repairs, cleanup & contents</div></div>
                    <div className="fbox fb-o"><div className="flbl">5-Year Cost (No Action)</div><div className="famt">{result.financial.fiveYearNoAction}</div><div className="fnote">Cumulative projected exposure</div></div>
                    <div className="fbox fb-b"><div className="flbl">Flood Insurance Range</div><div className="famt">{result.financial.insurancePremiumRange}</div><div className="fnote">Estimated annual premium</div></div>
                    <div className="fbox fb-g"><div className="flbl">Property Value Impact</div><div className="famt">{result.financial.propertyValueImpact}</div><div className="fnote">vs. low-risk comparables</div></div>
                  </div>
                  <div className="fnarr">{result.financial.narrative}</div>
                </div>
              </div>

              {/* CALCULATOR */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">📊</span><span className="sec-title">Before vs. After: Your Savings Calculator</span></div>
                <div className="sec-body">
                  <CostCalculator score={result.score} />
                </div>
              </div>

              {/* DIY Solutions */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">🔨</span><span className="sec-title">Your DIY Protection Plan, {form.firstName}</span></div>
                <div className="sec-body">
                  <p style={{fontSize:13,color:"var(--sub)",marginBottom:16,lineHeight:1.6}}>
                    Based on your property profile, here are the protection categories most relevant to your situation — each with estimated annual savings if implemented. Click any category to explore products and get started today.
                    {!hasBasement && <span style={{display:"block",marginTop:5,color:"var(--teal)",fontWeight:600}}>✓ Tailored for a property without a basement.</span>}
                    {form.treesOverhang==="Yes" && <span style={{display:"block",marginTop:5,color:"#7a5200",fontWeight:600}}>🌳 Gutter and debris management solutions included based on your tree canopy.</span>}
                  </p>
                  <div className="cat-grid">
                    {activeCats.map(cat => {
                      const savings = result.catSavings?.[cat.id] || cat.baseSaving;
                      return (
                        <div className="cat" key={cat.id}>
                          <a className="cat-top" href={cat.url} target="_blank" rel="noopener noreferrer">
                            <span className="cat-ico">{cat.icon}</span>
                            <div className="cat-info">
                              <div className="cat-title">{cat.title}</div>
                              <div className="cat-tagline">{cat.tagline}</div>
                            </div>
                            <span className="cat-arrow">→</span>
                          </a>
                          <div className="cat-body">
                            <div className="cat-desc">{cat.desc}</div>
                            <div className="cat-saving">
                              <span className="cat-saving-ico">💚</span>
                              <span className="cat-saving-text">Estimated saving if implemented: {fmt(savings)}/year avg</span>
                            </div>
                            <div className="cat-pills">
                              {cat.products.map(p=><span className="cpill" key={p}>{p}</span>)}
                            </div>
                            <a className="cat-cta" href={cat.url} target="_blank" rel="noopener noreferrer">
                              Explore {cat.title} Solutions →
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Professional Services */}
              <div className="sec">
                <div className="sec-hd"><span className="sec-ico">👷</span><span className="sec-title">Professional Services</span></div>
                <div className="sec-body">
                  <div className="pro-list">
                    {(result.proServices||[]).map((s,i)=>(
                      <div className="pro-item" key={i}>
                        <div className="pro-ico">{s.icon}</div>
                        <div style={{flex:1}}>
                          <div className="pro-name">{s.name}</div>
                          <div className="pro-desc">{s.desc}</div>
                          <div className="pro-meta">
                            <span className="ptag pt-c">💲 {s.cost}</span>
                            <span className="ptag pt-i">⚡ {s.impact} Impact</span>
                            <span className="ptag pt-t">⏱ {s.time}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

{/* Email Nurture + Lead Conversion */}
<div className="sec">
  <div className="sec-hd">
    <span className="sec-ico">📧</span>
    <span className="sec-title">What Happens After You Get Your Results</span>
  </div>

  <div className="sec-body">
    <p style={{fontSize:13,color:"var(--sub)",marginBottom:8,lineHeight:1.6}}>
      When you connect with a specialist below, you'll receive expert flood protection insights — including seasonal alerts, product recommendations, and periodic check-ins to help keep your home protected year-round.
    </p>

    <p style={{fontSize:12,color:"var(--sub)",opacity:0.85,textAlign:"center",marginBottom:14}}>
      No spam — just practical guidance tailored to your property.
    </p>
  </div>
</div>

              {/* Lead CTA */}
              <div className="lead-banner">
                <h2>Ready to Protect Your Home, {form.firstName}?</h2>
                <p>Connect with a local flood protection specialist. We'll match you with the right products and services — and enrol you in our seasonal protection email series.</p>
               {!leadDone ? (
  <div className="lform">
    <div className="lrow">
      <input
        className="li"
        placeholder="Your full name"
        value={lead.name}
        onChange={e => setLead(l => ({ ...l, name: e.target.value }))}
      />
      <input
        className="li"
        type="tel"
        placeholder="Phone number"
        value={lead.phone}
        onChange={e => setLead(l => ({ ...l, phone: e.target.value }))}
      />
    </div>

    <div className="fld" style={{ textAlign: "left" }}>
      <label style={{ fontSize: 12, opacity: 0.85, marginBottom: 6, display: "block" }}>
        What would you like help with?
      </label>

      <div style={{ position: "relative" }}>
        <select
          className="ls2"
          value={lead.interest}
          onChange={e => setLead(l => ({ ...l, interest: e.target.value }))}
          style={{ appearance: "none", WebkitAppearance: "none", paddingRight: 40 }}
        >
          <option value="Full Professional Assessment">Full Professional Assessment</option>
          <option value="Product Recommendations">Product Recommendations</option>
          <option value="Flood Prevention Planning">Flood Prevention Planning</option>
          <option value="Insurance & Risk Review">Insurance & Risk Review</option>
          <option value="General Questions">General Questions</option>
        </select>

        <div
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            fontSize: 12,
            opacity: 0.7,
            color: "#fff"
          }}
        >
          ▼
        </div>
      </div>
    </div>

    <button className="btn-lead" onClick={handleLeadSubmit}>
      GET MY PERSONALIZED PLAN →
    </button>

    <div className="lprivacy">
      🔒 Your information is never sold. You can unsubscribe from emails at any time.
    </div>
  </div>
) : (
  <div className="lsuccess">
    <h3>✓ You're all set, {form.firstName}!</h3>
    <p>
      A local specialist will reach out within 1 business day. Watch your inbox for your first flood protection tip shortly.
    </p>
  </div>
)}
</div>
              <button className="btn-reset" onClick={reset}>← Analyse Another Property</button>
            </div>
          )}
          <Toast show={copied} message="✓ Link copied to clipboard!" />
        </div>
      </div>
    </>
  );
}