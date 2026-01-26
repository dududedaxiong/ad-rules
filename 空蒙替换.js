// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  // 增加本地保底过滤词，确保外部加载失败也能过滤“冰茶”
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '冰茶'],
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP', '密码不正确'],
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  SPECIAL_CHANNEL_MAPPING: {}
};
// ==================== 规则配置区域结束 ====================

(() => {
const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

// 使用 Set 确保并集，解决“冰茶”过滤不掉的问题
let groupFilters = new Set(RULES_CONFIG.DEFAULT_GROUP_FILTERS.map(f => f.toLowerCase()));
let channelFilters = new Set(RULES_CONFIG.DEFAULT_CHANNEL_FILTERS.map(f => f.toLowerCase()));

function loadExternalRules() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', RULES_CONFIG.EXTERNAL_RULES_URL, false);
    xhr.send();
    if (xhr.status === 200 && xhr.responseText) {
      const rulesLines = xhr.responseText.split('\n');
      for (const line of rulesLines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GROUP_FILTERS=')) {
          trimmed.replace('GROUP_FILTERS=', '').split('|').forEach(f => { if(f.trim()) groupFilters.add(f.trim().toLowerCase()); });
        } else if (trimmed.startsWith('CHANNEL_FILTERS=')) {
          trimmed.replace('CHANNEL_FILTERS=', '').split('|').forEach(f => { if(f.trim()) channelFilters.add(f.trim().toLowerCase()); });
        }
      }
      return true;
    }
    return false;
  } catch (e) { return false; }
}

loadExternalRules();

// 极致模糊匹配：移除空格并转小写
function isMatch(text, filterSet) {
  if (!text) return false;
  const target = text.toLowerCase().replace(/\s+/g, '');
  for (let f of filterSet) {
    if (target.includes(f.replace(/\s+/g, ''))) return true;
  }
  return false;
}

// 优化 CCTV 规范化逻辑
function normalizeCCTVName(name) {
  const trimmed = name.trim();
  const match = trimmed.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    const number = parseInt(match[2], 10);
    const suffix = match[3].trim();
    return suffix ? `${prefix}-${number} ${suffix}` : `${prefix}-${number}`;
  }
  return trimmed;
}

// 修复排序逻辑：解决 CCTV-4 乱序问题
function extractCCTVNumber(name) {
  const match = name.match(/(?:CCTV|CETV|CGTN)[\s-]*(\d+)/i);
  return match ? parseInt(match[1], 10) : 999;
}

const globalSortChannels = (lines) => {
  const grouped = {};
  const groupOrder = [];
  let currentGroup = null;

  for (const line of lines) {
    if (line.match(/^.+,#genre#$/)) {
      currentGroup = line.split(',')[0].trim();
      if (!grouped[currentGroup]) {
        grouped[currentGroup] = [];
        groupOrder.push(currentGroup);
      }
    } else if (line.includes(',') && currentGroup) {
      grouped[currentGroup].push(line);
    }
  }

  // 针对 CCTV 组进行精确数字排序
  for (const g in grouped) {
    grouped[g].sort((a, b) => {
      const nameA = a.split(',')[0];
      const nameB = b.split(',')[0];
      const numA = extractCCTVNumber(nameA);
      const numB = extractCCTVNumber(nameB);
      if (numA !== numB) return numA - numB;
      return nameA.localeCompare(nameB, 'zh-CN');
    });
  }

  const result = [];
  const types = { 'CCTV': [], '卫视': [], '其他': [] };
  groupOrder.forEach(gn => {
    if (gn.toUpperCase().includes('CCTV')) types['CCTV'].push(gn);
    else if (gn.includes('卫视')) types['卫视'].push(gn);
    else types['其他'].push(gn);
  });

  ['CCTV', '卫视', '其他'].forEach(t => {
    types[t].forEach(gn => {
      result.push(`${gn},#genre#`);
      result.push(...grouped[gn]);
    });
  });
  return result;
};

// M3U 核心处理：精准捕获 group-title
function processM3uFormat(content) {
  const lines = content.split('\n');
  const seenUrls = new Set();
  const result = [];
  result.push('#EXTM3U');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const gMatch = line.match(/group-title="([^"]+)"/i);
      const groupName = gMatch ? gMatch[1] : "其他";
      const displayName = line.split(',').pop();

      // 分组和频道独立过滤
      if (isMatch(groupName, groupFilters) || isMatch(displayName, channelFilters)) {
        i++; continue; 
      }

      const url = lines[i+1] ? lines[i+1].trim() : "";
      if (url && url.startsWith('http') && !seenUrls.has(url)) {
        const newName = normalizeCCTVName(displayName);
        const newInf = line.replace(displayName, newName).replace(/group-title="[^"]*"/i, `group-title="${groupName}"`);
        result.push(newInf, url);
        seenUrls.add(url);
        i++;
      }
    }
  }
  return result.join('\n');
}

function processTxtFormat(content) {
  const lines = content.split('\n');
  const result = [];
  let skipG = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes(',#genre#')) {
      skipG = isMatch(t.split(',')[0], groupFilters);
      if (!skipG) result.push(t);
    } else if (t.includes(',') && !skipG) {
      const [name, url] = t.split(',');
      if (!isMatch(name, channelFilters)) {
        result.push(`${normalizeCCTVName(name)},${url}`);
      }
    }
  }
  return globalSortChannels(result).join('\n');
}

let content = global.YYKM.fetch(global.params.url);
const format = content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
content = format === 'M3U' ? processM3uFormat(content) : processTxtFormat(content);

// 自定义替换逻辑
const replaceParam = global.params.replace;
if (typeof replaceParam === "string") {
  replaceParam.split(";").forEach(rule => {
    const [from, to] = rule.split("->");
    if (from && to) content = content.replaceAll(from, to);
  });
}

return content;
})();