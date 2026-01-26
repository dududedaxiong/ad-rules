(() => {
const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

// 禁用外部规则，只用默认规则
const DEFAULT_GROUP_FILTERS = ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '维护', '官方'];
const DEFAULT_CHANNEL_FILTERS = ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', '免费订阅', 'HTTP'];

let content = global.YYKM.fetch(global.params.url);

function shouldFilter(text) {
  return DEFAULT_GROUP_FILTERS.some(filter => text.includes(filter)) || 
         DEFAULT_CHANNEL_FILTERS.some(filter => text.includes(filter));
}

function detectFormat(content) {
  return content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
}

function processTxtFormat(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const result = [];
  let skipCurrentGroup = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    if (trimmedLine.match(/^.+,#genre#$/)) {
      const groupName = trimmedLine.split(',')[0].trim();
      skipCurrentGroup = shouldFilter(groupName);
      if (!skipCurrentGroup && !seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    }
    else if (trimmedLine.match(/^.+,.+$/)) {
      if (!skipCurrentGroup && !shouldFilter(trimmedLine) && !seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    }
  }
  return result.join('\n');
}

function processM3uFormat(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const result = [];
  let skipNextUrl = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    if (trimmedLine.startsWith('#EXTM3U')) {
      result.push(trimmedLine);
      continue;
    }
    
    if (trimmedLine.startsWith('#EXTINF')) {
      skipNextUrl = shouldFilter(trimmedLine);
      if (!skipNextUrl && !seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    } else if (!trimmedLine.startsWith('#') && trimmedLine) {
      if (!skipNextUrl && !seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
      skipNextUrl = false;
    }
  }
  return result.join('\n');
}

const format = detectFormat(content);
content = format === 'M3U' ? processM3uFormat(content) : processTxtFormat(content);

const replaceParam = global.params.replace;
if (typeof replaceParam === "string" && replaceParam.length > 0) {
  const rules = replaceParam.split(";");
  for (const rule of rules) {
    const idx = rule.indexOf("->");
    if (idx === -1) continue;
    const from = rule.slice(0, idx);
    const to = rule.slice(idx + 2);
    content = content.replaceAll(from, to);
  }
}

return content;
})();