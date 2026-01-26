(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  var content = global.YYKM.fetch("https://img.131213.xyz/tfile/BQACAgUAAx0Eflp52gABASOSaXeKxYZRKd6a05c3cfnOJm_Y6RUAAjQZAAIKH8FX-a_fCyyuTY44BA");

  content = content
    .replaceAll("https://", "webview://https://")
    .replaceAll("http://A/ku9/js/webview.js?id=", "webview://")
    .replaceAll("http://", "webview://http://");

  return content;
})();