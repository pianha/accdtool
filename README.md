# accdtool
 * 文件加速 · URL Proxy（Cloudflare Worker 单文件版）
 * 仿 nb.xymm.de5.net「Q版 URL Proxy v3」同款功能：
   * 输入远程文件地址，生成加速链接
   * 支持 HTTP / HTTPS 公网文件（走 Cloudflare 边缘网络中转）
   * TXT / M3U / M3U8 等文本源自动改写：把里面的相对或绝对地址
 * 全部换成加速链接，播放器直接可用
 * 部署：Cloudflare Dashboard → Workers & Pages → Create → 粘贴for_worker.js文件 → Deploy
 * 免费额度：每天 10 万次请求
   
