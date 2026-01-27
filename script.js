(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;
  // 1. 获取数据（内嵌 UA）
  var content = global.YYKM.fetch("https://img.131213.xyz/tfile/BQACAgUAAx0Eflp52gABASORaXdbpO0p7IMpTiebDJy6u4WwxewAAq4aAAIKH7lXS88ZiCssf4Q4BA#sp;ua=okhttp");
  // 2. 替换内容
  content = content
    .replaceAll("https://", "webview://https://");
  return content;
})();