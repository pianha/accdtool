/**
 * 文件加速 · URL Proxy（Cloudflare Worker 单文件版）
 * 仿 nb.xymm.de5.net「Q版 URL Proxy v3」同款功能：
 *  - 输入远程文件地址，生成加速链接
 *  - 支持 HTTP / HTTPS 公网文件（走 Cloudflare 边缘网络中转）
 *  - TXT / M3U / M3U8 等文本源自动改写：把里面的相对或绝对地址
 *    全部换成加速链接，播放器直接可用
 *
 * 部署：Cloudflare Dashboard → Workers & Pages → Create → 粘贴本文件 → Deploy
 * 免费额度：每天 10 万次请求
 */

// ============ 配置 ============
const CONFIG = {
  // 访问密码：留空 = 公开访问；填入任意字符串后，请求需带 ?token=你的密码
  // 公开代理容易被他人滥用刷流量，建议设置一个简单密码自用
  TOKEN: "",

  // 回源时使用的 UA（有些源站会按 UA 拦截）
  PROXY_UA:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// 需要改写内链的文本类型（按扩展名或 Content-Type 判断）
const REWRITE_EXTS = ["m3u8", "m3u", "txt"];
// ============ 配置结束 ============

addEventListener("fetch", (event) => {
  event.respondWith(
    handle(event.request).catch(
      (err) => new Response("加速失败：" + err.message, { status: 502 })
    )
  );
});

async function handle(req) {
  const u = new URL(req.url);

  // CORS 预检
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (u.pathname === "/favicon.ico") return new Response("", { status: 204 });

  // 首页（无 url 参数时显示 UI）
  if ((u.pathname === "/" || u.pathname === "/index.html") && !u.searchParams.has("url")) {
    return ui(u);
  }

  // ---- 取目标地址：优先 ?url= 编码参数，其次 /https://... 路径模式 ----
  let target = u.searchParams.get("url");
  if (!target && u.pathname.length > 1) {
    target = decodeURIComponent(u.pathname.slice(1)) + u.search;
  }
  if (!target) return ui(u);
  if (!/^https?:\/\//i.test(target)) {
    return new Response("目标地址必须是 http(s):// 开头", { status: 400 });
  }

  // 简单密码保护
  if (CONFIG.TOKEN && u.searchParams.get("token") !== CONFIG.TOKEN) {
    return new Response("需要正确的 token 才能使用", { status: 401 });
  }

  // ---- 回源 ----
  const fwd = new Headers();
  fwd.set("User-Agent", CONFIG.PROXY_UA);
  try {
    fwd.set("Referer", new URL(target).origin + "/");
  } catch {}
  const range = req.headers.get("Range");
  if (range) fwd.set("Range", range);

  const upstream = await fetch(target, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers: fwd,
    redirect: "follow",
  });

  const out = new Headers();
  out.set("Access-Control-Allow-Origin", "*");
  out.set("Cache-Control", "public, max-age=60");

  const ct = upstream.headers.get("Content-Type") || "";
  const ext = target.split("?")[0].split(".").pop().toLowerCase();
  const isText =
    REWRITE_EXTS.includes(ext) ||
    ct.includes("text") ||
    ct.includes("mpegurl") ||
    ct.includes("x-mpegurl");

  const wrap = (absUrl) => u.origin + "/?url=" + encodeURIComponent(absUrl);

  // ---- 文本源：改写内链 ----
  if (isText && upstream.ok) {
    const text = await upstream.text();
    const body = rewriteText(text, target, u.origin, wrap);
    out.set(
      "Content-Type",
      ext === "m3u8" || ct.includes("mpegurl")
        ? "application/vnd.apple.mpegurl; charset=utf-8"
        : "text/plain; charset=utf-8"
    );
    return new Response(body, { status: upstream.status, headers: out });
  }

  // ---- 二进制：直接透传（支持 Range 断点续传）----
  ["Content-Type", "Content-Length", "Content-Encoding", "Accept-Ranges", "Content-Range", "ETag", "Last-Modified"].forEach(
    (h) => {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
  );
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/**
 * 改写文本源内的链接：
 *  - m3u8：非 # 行是分片/子播放列表地址；# 行里的 URI="..."（KEY/MAP）也改写
 *  - txt：支持「频道名,URL」格式
 *  - 相对地址按源站补全为绝对地址，再套上加速前缀
 */
function rewriteText(text, base, selfOrigin, wrap) {
  const abs = (u) => {
    try {
      return new URL(u, base).href;
    } catch {
      return null;
    }
  };
  // 已经是本站加速链接的不再重复套娃
  const wrapIfNeeded = (raw) => {
    if (!raw || raw.startsWith(selfOrigin)) return raw;
    const a = abs(raw);
    return a ? wrap(a) : raw;
  };

  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;

      if (t.startsWith("#")) {
        return line
          .replace(/URI="([^"]+)"/g, (m, p1) => `URI="${wrapIfNeeded(p1)}"`)
          .replace(/(https?:\/\/[^\s"'<>]+)/g, (m) => wrapIfNeeded(m));
      }

      // 「名称,URL」格式（txt 常见）
      const comma = t.lastIndexOf(",");
      if (comma > 0) {
        const tail = t.slice(comma + 1).trim();
        if (tail && !tail.startsWith(selfOrigin)) {
          const a = abs(tail);
          if (a) return t.slice(0, comma + 1) + wrap(a);
        }
        return line;
      }

      // 纯 URL 行（含相对路径）
      const a = abs(t);
      return a ? wrap(a) : line;
    })
    .join("\n");
}

// ============ 首页 UI ============
function ui(u) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>文件加速 🎀</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(135deg, #ffeef5 0%, #f3e8ff 100%);
    min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .card {
    background: #fff; border-radius: 20px; padding: 36px 32px; max-width: 560px; width: 100%;
    box-shadow: 0 12px 40px rgba(255, 150, 200, .25); text-align: center;
  }
  h1 { font-size: 28px; margin-bottom: 6px; }
  .sub { color: #999; font-size: 14px; margin-bottom: 24px; }
  .row { display: flex; gap: 10px; }
  input {
    flex: 1; padding: 13px 16px; border: 2px solid #ffd3e6; border-radius: 12px;
    font-size: 15px; outline: none; transition: border .2s;
  }
  input:focus { border-color: #ff8fc0; }
  button {
    padding: 13px 26px; border: none; border-radius: 12px; font-size: 15px; cursor: pointer;
    background: linear-gradient(135deg, #ff8fc0, #c084fc); color: #fff; font-weight: bold; white-space: nowrap;
  }
  button:active { transform: scale(.97); }
  #result { display: none; margin-top: 22px; text-align: left; }
  #result .ok { color: #22c55e; font-weight: bold; margin-bottom: 10px; }
  .linkbox {
    display: flex; gap: 8px; background: #fdf2f8; border: 1px dashed #ff8fc0;
    border-radius: 10px; padding: 10px 12px; align-items: center;
  }
  #link { flex: 1; word-break: break-all; font-size: 13px; color: #7c3aed; }
  #copy { padding: 8px 14px; font-size: 13px; }
  .tip { margin-top: 22px; font-size: 13px; color: #aaa; line-height: 1.9; }
  .foot { margin-top: 14px; font-size: 12px; color: #d8b4e2; }
</style>
</head>
<body>
  <div class="card">
    <h1>🎀 文件加速</h1>
    <div class="sub">输入远程文件地址，生成加速链接</div>
    <div class="row">
      <input id="url" placeholder="https://example.com/xxx.m3u8">
      <button onclick="gen()">✨ 生成</button>
    </div>
    <div id="result">
      <div class="ok">✨ 加速链接生成成功</div>
      <div class="linkbox">
        <span id="link"></span>
        <button id="copy" onclick="copy()">复制</button>
      </div>
    </div>
    <div class="tip">
      支持 HTTP / HTTPS 公网文件<br>
      TXT · M3U · M3U8 等文本源自动改写内链
    </div>
    <div class="foot">URL Proxy · 自建版</div>
  </div>
<script>
  const input = document.getElementById('url');
  const result = document.getElementById('result');
  const linkEl = document.getElementById('link');
  function gen() {
    let v = input.value.trim();
    if (!v) { alert('请先输入文件地址'); return; }
    if (!/^https?:\\/\\//i.test(v)) v = 'https://' + v;
    const link = location.origin + '/?url=' + encodeURIComponent(v);
    linkEl.textContent = link;
    result.style.display = 'block';
  }
  function copy() {
    navigator.clipboard.writeText(linkEl.textContent).then(() => {
      const b = document.getElementById('copy');
      b.textContent = '已复制 ✓';
      setTimeout(() => b.textContent = '复制', 1500);
    });
  }
  input.addEventListener('keydown', e => { if (e.key === 'Enter') gen(); });
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
