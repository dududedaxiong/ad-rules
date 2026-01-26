(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  var content = global.YYKM.fetch("https://img.131213.xyz/tfile/BQACAgUAAx0Eflp52gABASORaXdbpO0p7IMpTiebDJy6u4WwxewAAq4aAAIKH7lXS88ZiCssf4Q4BA");

  content = content
    .replaceAll("https://", "webview://https://")
    .replaceAll("http://A/ku9/js/webview.js?id=", "webview://");

  return content;
})();