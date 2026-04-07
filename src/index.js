const CANONICAL_HOST = "erheidinopin.is";
const ENFORCE_CANONICAL = false;

const ROAD_STATUS_URL = "https://gagnaveita.vegagerdin.is/api/faerd2017_1";

const HELLISHEIDI_ROUTE = [
  {
    key: "hellisheidi-westbound",
    roadIdPrefix: 90202,
    label: "Hringvegur um Hellisheiði: Þorlákshafnarvegur - Þrengslavegur",
    fallbackName: "Hringvegur um Hellisheiði: Þorlákshafnarvegur - Þrengslavegur"
  },
  {
    key: "hellisheidi-eastbound",
    roadIdPrefix: 25209,
    label: "Hringvegur um Hellisheiði: Þrengslavegur - Þorlákshafnarvegur",
    fallbackName: "Hringvegur um Hellisheiði: Þrengslavegur - Þorlákshafnarvegur"
  },
  {
    key: "threngsli",
    roadIdPrefix: 90234,
    label: "Þrengslavegur: Þrengsli",
    fallbackName: "Þrengslavegur: Þrengsli"
  }
];

const MAIN_HEATH_KEYS = new Set(["hellisheidi-westbound", "hellisheidi-eastbound"]);
const THRENGSLI_KEY = "threngsli";

const CLOSED_SURFACE_CODES = new Set([
  "LOKAD",
  "OFAERT_ANNAD",
  "OFAERT_VEDUR",
  "FAERT_FJALLABILUM",
  "EKKI_I_THJONUSTU"
]);

const UNKNOWN_SURFACE_CODES = new Set(["OTHEKKT"]);
const CLOSED_EXTRA_CODES = new Set(["ALLUR_AKSTUR_BANN", "FAERT_FJALLABILUM", "OTHEKKT"]);

const OPEN_SURFACE_CODES = new Set([
  "GREIDFAERT",
  "HALKA",
  "HALKUBLETTIR",
  "FLUGHALT",
  "KRAP",
  "SNJOTHEKJA",
  "THAEFINGUR",
  "THUNGFAERT"
]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (ENFORCE_CANONICAL && url.hostname !== CANONICAL_HOST) {
      url.hostname = CANONICAL_HOST;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 308);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") {
      return new Response(HTML_PAGE, { headers: htmlHeaders() });
    }

    if (path === "/app.js") {
      return new Response(APP_JS, { headers: jsHeaders() });
    }

    if (path === "/ads.txt") {
      return new Response(ADS_TXT, { headers: textHeaders() });
    }

    if (path === "/status") {
      return respond(await getStatus());
    }

    return respond({ ok: false, error: "Notaðu: /, /app.js, /ads.txt, /status" });
  }
};

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400"
  };
}

function jsonHeaders() {
  return {
    ...cors(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60"
  };
}

function htmlHeaders() {
  return {
    ...cors(),
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=60"
  };
}

function textHeaders() {
  return {
    ...cors(),
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=300"
  };
}

function jsHeaders() {
  return {
    ...cors(),
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "public, max-age=60"
  };
}

function respond(obj) {
  return new Response(JSON.stringify(obj), {
    headers: jsonHeaders(),
    status: 200
  });
}

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "erheidinopin.is (+https://erheidinopin.is)"
    }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} á ${url}`);
  return r.json();
}

function normalize(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

function roadIdPrefix(idButur) {
  const numeric = Number(idButur);
  if (!Number.isFinite(numeric)) return null;
  return Math.floor(numeric / 10000);
}

function pickSegments(allSegments) {
  const byPrefix = new Map();
  for (const segment of allSegments) {
    const prefix = roadIdPrefix(segment?.IdButur);
    if (!prefix || byPrefix.has(prefix)) continue;
    byPrefix.set(prefix, segment);
  }

  return HELLISHEIDI_ROUTE.map((wanted) => {
    const byId = byPrefix.get(wanted.roadIdPrefix);
    if (byId) return { route: wanted, segment: byId };

    const fallbackNormalized = normalize(wanted.fallbackName);
    const fallbackSegment =
      allSegments.find((segment) => normalize(segment?.FulltNafnButs) === fallbackNormalized) ||
      null;

    return fallbackSegment ? { route: wanted, segment: fallbackSegment } : null;
  }).filter(Boolean);
}

function classifySegment(segment) {
  const surface = String(segment?.AstandYfirbord || "").trim().toUpperCase();
  const extra = String(segment?.AstandVidbotaruppl || "").trim().toUpperCase();

  if (CLOSED_EXTRA_CODES.has(extra)) {
    return {
      severity: 3,
      closed: true,
      reason: segment?.AstandLysing || "Lokað"
    };
  }

  if (CLOSED_SURFACE_CODES.has(surface)) {
    return {
      severity: 3,
      closed: true,
      reason: segment?.AstandLysing || humanizeCode(surface)
    };
  }

  if (UNKNOWN_SURFACE_CODES.has(surface)) {
    return {
      severity: 2,
      closed: true,
      reason: segment?.AstandLysing || "Óviss staða"
    };
  }

  if (OPEN_SURFACE_CODES.has(surface)) {
    return {
      severity: 1,
      closed: false,
      reason: segment?.AstandLysing || humanizeCode(surface)
    };
  }

  return {
    severity: 2,
    closed: true,
    reason: segment?.AstandLysing || "Óþekkt ástand"
  };
}

function humanizeCode(code = "") {
  const normalized = String(code).trim().toUpperCase();
  switch (normalized) {
    case "GREIDFAERT":
      return "Greiðfært";
    case "HALKA":
      return "Hált";
    case "HALKUBLETTIR":
      return "Hálkublettir";
    case "FLUGHALT":
      return "Flughált";
    case "KRAP":
      return "Krap";
    case "SNJOTHEKJA":
      return "Snjóþekja";
    case "THAEFINGUR":
      return "Þæfingur";
    case "THUNGFAERT":
      return "Þungfært";
    case "LOKAD":
      return "Lokað";
    case "OFAERT_ANNAD":
    case "OFAERT_VEDUR":
      return "Ófært";
    case "EKKI_I_THJONUSTU":
      return "Ekki í þjónustu";
    case "OTHEKKT":
      return "Óþekkt staða";
    default:
      return code || "Óþekkt staða";
  }
}

function sortBySeverity(a, b) {
  if (b.status.severity !== a.status.severity) {
    return b.status.severity - a.status.severity;
  }

  const timeA = Date.parse(a.segment?.DagsSkrad || "") || 0;
  const timeB = Date.parse(b.segment?.DagsSkrad || "") || 0;
  return timeB - timeA;
}

async function getStatus() {
  try {
    const allSegments = await fetchJson(ROAD_STATUS_URL);
    if (!Array.isArray(allSegments)) {
      throw new Error("Óvænt svar frá Vegagerðinni");
    }

    const matchingSegments = pickSegments(allSegments);
    if (!matchingSegments.length) {
      throw new Error("Fann ekki rétta vegkafla fyrir Hellisheiði");
    }

    const evaluated = matchingSegments
      .map(({ route, segment }) => ({
        route,
        segment,
        status: classifySegment(segment)
      }))
      .sort(sortBySeverity);

    const mainSegments = evaluated.filter(({ route }) => MAIN_HEATH_KEYS.has(route.key));
    const threngsli = evaluated.find(({ route }) => route.key === THRENGSLI_KEY);

    if (mainSegments.length !== 2) {
      throw new Error("Fann ekki báða Hellisheiðarkaflana");
    }

    const mainClosed = mainSegments.some(({ status }) => status.closed);
    const mainReason = mainClosed
      ? mainSegments.find(({ status }) => status.closed)?.status.reason || "Lokað"
      : mainSegments[0]?.status.reason || "Greiðfært";

    const threngsliOpen = threngsli ? !threngsli.status.closed : null;

    return {
      ok: true,
      road: "Hellisheiði milli Hveragerðis og Reykjavíkur",
      closed: mainClosed,
      reason: mainReason,
      threngsli: {
        found: Boolean(threngsli),
        closed: threngsli ? threngsli.status.closed : null,
        message: threngsli
          ? threngsliOpen
            ? "Þrengslin eru opin"
            : mainClosed
              ? "Þrengslin eru líka lokuð"
              : "En Þrengslin eru lokuð"
          : "Staða Þrengsla er óþekkt",
        reason: threngsli?.status.reason || null
      },
      checkedAt: new Date().toISOString(),
      debug: {
        source: ROAD_STATUS_URL,
        evaluatedSegments: evaluated.map(({ route, segment, status }) => ({
          key: route.key,
          idButur: Number(segment.IdButur),
          roadIdPrefix: roadIdPrefix(segment.IdButur),
          shortName: segment.StuttNafnButs,
          fullName: segment.FulltNafnButs,
          surfaceCode: segment.AstandYfirbord,
          extraCode: segment.AstandVidbotaruppl,
          description: segment.AstandLysing,
          classifiedClosed: status.closed,
          severity: status.severity,
          recordedAt: segment.DagsSkrad
        }))
      }
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      checkedAt: new Date().toISOString()
    };
  }
}

const ADS_TXT = `google.com, pub-5396954897194569, DIRECT, f08c47fec0942fa0
`;

const HTML_PAGE = `<!doctype html>
<html lang="is">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Er heiðin opin?</title>
  <meta name="description" content="Raunstöða fyrir Hellisheiði: opin eða lokuð." />
  <meta name="theme-color" content="#0b1020" />
  <meta name="google-adsense-account" content="ca-pub-5396954897194569" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5396954897194569"
          crossorigin="anonymous"></script>
  <link id="favicon" rel="icon"
        href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='gray'/></svg>">
  <style>
    :root {
      --bg:#0b1020;
      --card:#151a30;
      --ok:#36d399;
      --no:#f43f5e;
      --warn:#f59e0b;
    }
    * { box-sizing: border-box; }
    html,body {
      height:100%;
      margin:0;
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
      background:var(--bg);
      color:#fff;
    }
    main {
      min-height:100%;
      display:grid;
      place-items:center;
      padding:24px;
    }
    .card {
      width:min(92vw,900px);
      background:var(--card);
      border-radius:20px;
      padding:32px 24px;
      box-shadow:0 12px 40px rgba(0,0,0,.35);
    }
    .title {
      text-align:center;
      font-size: clamp(18px,2.5vw,22px);
      opacity:.85;
    }
    .answer {
      text-align:center;
      font-size: clamp(42px,9vw,88px);
      font-weight:800;
      margin:.2em 0 .05em;
      line-height:1.05;
    }
    .ok { color: var(--ok); }
    .no { color: var(--no); }
    .error { color: var(--warn); }
    .meta {
      text-align:center;
      font-size: clamp(14px,2vw,16px);
      opacity:.9;
    }
    .reason {
      margin-top:.35rem;
    }
    .row {
      margin-top:.5rem;
    }
    .ad-wrap {
      margin-top: 18px;
      display: flex;
      justify-content: center;
    }
    .ad-box {
      width: min(100%, 720px);
      min-height: 90px;
      background: rgba(255,255,255,.03);
      border-radius: 14px;
      padding: 10px;
      overflow: hidden;
    }
    details {
      margin-top: 14px;
      background: rgba(255,255,255,.04);
      border-radius:12px;
      padding:10px 12px;
    }
    summary {
      cursor:pointer;
      opacity:.9;
    }
    pre {
      white-space:pre-wrap;
      word-break:break-word;
      margin:8px 0 0;
    }
    footer {
      margin-top: 12px;
      text-align:center;
      opacity:.55;
      font-size:13px;
    }
    footer a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <div class="title">Er heiðin opin?</div>
      <div id="answer" class="answer">—</div>
      <div id="reason" class="meta reason"></div>
      <div id="threngsli" class="meta row"></div>
      <div id="err" class="meta row error" style="display:none"></div>
      <div class="ad-wrap">
        <div class="ad-box">
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="ca-pub-5396954897194569"
               data-ad-slot="9399802937"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
        </div>
      </div>

      <details id="dbg" style="display:none">
        <summary>Stillingar og bilanagreining</summary>
        <div class="meta">
          <div>Status endpoint: <code id="dbg-endpoint"></code></div>
          <div>JSON (status):</div>
          <pre id="dbg-json-status"></pre>
        </div>
      </details>

      <footer>
        Gögn: Vegagerðin • Uppfærðist á 5 mínútna fresti •
        <a href="https://www.umferdin.is/" target="_blank" rel="noopener noreferrer">Umferdin.is</a>
      </footer>
    </section>
  </main>
  <script src="/app.js"></script>
</body>
</html>`;

const APP_JS = `(()=>{"use strict";
const STATUS_ENDPOINT="/status";
const params=new URLSearchParams(location.search);
const DEBUG=params.has("debug");
const $=id=>document.getElementById(id);
const elAns=$("answer"),elReason=$("reason"),elErr=$("err"),
      elThr=$("threngsli"),
      elDbg=$("dbg"),elDbgEndpoint=$("dbg-endpoint"),elDbgJsonStatus=$("dbg-json-status"),
      elFav=$("favicon");

function setFavicon(open){
  if(!elFav)return;
  const color=open?"limegreen":"crimson";
  const svg=encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='"+color+"'/></svg>");
  elFav.href="data:image/svg+xml,"+svg;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute("content",open?"#0d2a17":"#2a0d11");
}

function showStatus(data){
  if(!elAns)return;
  const isOpen=data && data.ok && data.closed===false;
  elAns.textContent=isOpen ? "Já" : (data && data.ok ? "Nei" : "Óþekkt staða");
  elAns.className="answer "+(isOpen?"ok":(data&&data.ok?"no":"error"));
  setFavicon(!!isOpen);

  if(elReason){
    const reason=(data?.reason||"").trim();
    elReason.textContent=reason ? "Staða: "+reason : "";
  }

  if(elThr){
    const msg=(data?.threngsli?.message||"").trim();
    elThr.textContent=msg;
  }
}

function showError(msg){
  if(elErr){
    elErr.style.display="";
    elErr.textContent=msg;
  }
  if(elAns){
    elAns.textContent="Óþekkt staða";
    elAns.className="answer error";
  }
  if(elReason){
    elReason.textContent="";
  }
  if(elThr){
    elThr.textContent="";
  }
  setFavicon(false);
}

async function fetchJSON(url){
  const withBust=url+(url.includes("?")?"&":"?")+"t="+Date.now();
  const r=await fetch(withBust,{cache:"no-store"});
  const txt=await r.text();
  try{
    return JSON.parse(txt);
  }catch{
    throw new Error("JSON parse error: "+url+" → "+txt.slice(0,200));
  }
}

async function refresh(){
  if(elErr) elErr.style.display="none";
  try{
    const status=await fetchJSON(STATUS_ENDPOINT);
    if(DEBUG&&elDbg){
      elDbg.style.display="";
      if(elDbgEndpoint) elDbgEndpoint.textContent=STATUS_ENDPOINT;
      if(elDbgJsonStatus) elDbgJsonStatus.textContent=JSON.stringify(status,null,2);
    }
    if(!status||status.ok===false) throw new Error(status?.error||"Villa frá status-endpointi");
    showStatus(status);
  }catch(e){
    console.error(e);
    showError("Gat ekki sótt gögn (reyndu að hlaða síðunni aftur).");
  }
}

refresh();
try{
  (adsbygoogle=window.adsbygoogle||[]).push({});
}catch(e){
  console.error("Adsense error",e);
}
setInterval(refresh,5*60*1000);
})();`;
