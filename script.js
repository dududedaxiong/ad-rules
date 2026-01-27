(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
  // 1. 获取数据（内嵌 UA）
  var content = global.YYKM.fetch("https://perfecttv.net/PerfecttvFree.m3u#sp;ua=okhttp");
  // 2. 替换内容
  content = content
    .replaceAll("https://", "webview://https://");
  return content;
})();