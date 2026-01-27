(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
  // 1. 获取订阅源数据（已注入 UA 和 Hash 参数）
  var content = global.YYKM.fetch("https://img.131213.xyz/tfile/BQACAgUAAx0Eflp52gABASORaXdbpO0p7IMpTiebDJy6u4WwxewAAq4aAAIKH7lXS88ZiCssf4Q4BA#sp;hash=time-interval://6h;ua=okhttp");
  // 2. 执行内容替换
  content = content
    .replaceAll("https://", "webview://https://");
  return content;
})();