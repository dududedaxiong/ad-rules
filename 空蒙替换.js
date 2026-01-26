(() => {
const global =
typeof globalThis !== "undefined"
? globalThis
: typeof window !== "undefined"
? window
: this;  

// ========== 配置区域（方便维护）==========
// 外部订阅规则地址
const EXTERNAL_RULES_URL = 'https://ghfast.top/https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/%E7%A9%BA%E8%92%99%E6%9B%BF%E6%8D%A2%E8%A7%84%E5%88%99.txt';

// 默认过滤规则
const DEFAULT_GROUP_FILTERS = ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'];
const DEFAULT_CHANNEL_FILTERS = ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', '免费订阅', 'HTTP'];

// ========== 配置区域结束 ==========

let content = global.YYKM.fetch(global.params.url);  

// 获取过滤规则
let groupFilters = DEFAULT_GROUP_FILTERS;
let channelFilters = DEFAULT_CHANNEL_FILTERS;

// 尝试从外部订阅获取规则
try {
  const externalRules = global.YYKM.fetch(EXTERNAL_RULES_URL);
  const rulesLines = externalRules.split('\n');
  
  for (const line of rulesLines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('GROUP_FILTERS=')) {
      groupFilters = trimmed.replace('GROUP_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
    } else if (trimmed.startsWith('CHANNEL_FILTERS=')) {
      channelFilters = trimmed.replace('CHANNEL_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
    }
  }
} catch (e) {
  // 外部规则获取失败，使用默认规则
}

// 参数覆盖
if (global.params.groupFilters) {
  groupFilters = global.params.groupFilters.split('|').map(f => f.trim()).filter(f => f);
}

if (global.params.channelFilters) {
  channelFilters = global.params.channelFilters.split('|').map(f => f.trim()).filter(f => f);
}

// 检查是否应该过滤分组
function shouldFilterGroup(groupName) {
  return groupFilters.some(filter => groupName.includes(filter));
}

// 检查是否应该过滤频道
function shouldFilterChannel(channelLine) {
  return channelFilters.some(filter => channelLine.includes(filter));
}

// 自动检测格式
function detectFormat(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('#EXTM3U')) {
    return 'M3U';
  }
  return 'TXT';
}

// 处理普通格式源
function processTxtFormat(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const result = [];
  let currentGroup = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) continue;
    
    if (trimmedLine.match(/^.+,#genre#$/)) {
      const groupName = trimmedLine.split(',')[0].trim();
      
      if (shouldFilterGroup(groupName)) {
        currentGroup = null;
        continue;
      }
      
      currentGroup = groupName;
      if (!seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    }
    else if (trimmedLine.match(/^.+,.+$/)) {
      if (currentGroup === null) {
        continue;
      }
      
      if (shouldFilterChannel(trimmedLine)) {
        continue;
      }
      
      if (!seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    }
  }
  
  return result.join('\n');
}

// 处理M3U格式源
function processM3uFormat(content) {
  const lines = content.split('\n');
  const seen = new Set();
  const result = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) continue;
    
    if (trimmedLine.startsWith('#EXTM3U')) {
      result.push(trimmedLine);
      continue;
    }
    
    if (trimmedLine.startsWith('#EXTINF')) {
      if (shouldFilterChannel(trimmedLine)) {
        continue;
      }
      
      if (!seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    } else if (!trimmedLine.startsWith('#') && trimmedLine) {
      if (!seen.has(trimmedLine)) {
        seen.add(trimmedLine);
        result.push(trimmedLine);
      }
    }
  }
  
  return result.join('\n');
}

// 检测格式并处理
const format = detectFormat(content);

if (format === 'M3U') {
  content = processM3uFormat(content);
} else {
  content = processTxtFormat(content);
}

// 执行用户定义的替换规则
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