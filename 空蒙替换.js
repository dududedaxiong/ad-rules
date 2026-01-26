// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  // 分组过滤：本地 + 外部并集
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '冰茶'],
  // 频道过滤：本地 + 外部并集
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP', '密码不正确'],
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  SPECIAL_CHANNEL_MAPPING: {}
};
// ==================== 规则配置区域结束 ====================

(() => {
const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

// 使用 Set 存储，确保本地规则与外部规则合并生效
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
    }
  } catch (e) {}
}
loadExternalRules();

// 极致模糊匹配：移除所有空格并转小写进行判定
function isMatch(text, filterSet) {
  if (!text) return false;
  const target = text.toLowerCase().replace(/\s+/g, '');
  for (let f of filterSet) {
    if (target.includes(f.replace(/\s+/g, ''))) return true;
  }
  return false;
}

// 规范化名称：处理 CCTV- 4 这种带空格的情况
function normalizeName(name) {
  let n = name.trim();
  const match = n.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    const num = match[2];
    const suffix = match[3].trim();
    return suffix ? `${prefix}-${num} ${suffix}` : `${prefix}-${num}`;
  }
  return n;
}

// 核心排序：提取 CCTV 后的数字，确保 CCTV-4 序列正确
function getSortWeight(name) {
  const n = name.toUpperCase();
  const m = n.match(/(?:CCTV|CETV|CGTN)[\s-]*(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 999;
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

  // 组内排序逻辑
  for (const g in grouped) {
    grouped[g].sort((a, b) => {
      const nameA = a.split(',')[0];
      const nameB = b.split(',')[0];
      const wA = getSortWeight(nameA);
      const wB = getSortWeight(nameB);
      if (wA !== wB) return wA - wB;
      return nameA.localeCompare(nameB, 'zh-CN');
    });
  }

  const result = [];
  const typeOrder = { 'CCTV': [], '卫视': [], '其他': [] };
  groupOrder.forEach(gn => {
    const upper = gn.toUpperCase();
    if (upper.includes('CCTV') || upper.includes('央视')) typeOrder['CCTV'].push(gn);
    else if (gn.includes('卫视')) typeOrder['卫视'].push(gn);
    else typeOrder['其他'].push(gn);
  });

  ['CCTV', '卫视', '其他'].forEach(t => {
    typeOrder[t].forEach(gn => {
      result.push(`${gn},#genre#`);
      result.push(...grouped[gn]);
    });
  });
  return result;
};

// M3U 逻辑修复：捕获 group-title 并执行独立过滤
function processM3u(content) {
  const lines = content.split('\n');
  const result = ['#EXTM3U'];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF')) {
      const gMatch = line.match(/group-title="([^"]+)"/i);
      const groupName = gMatch ? gMatch[1] : "其他";
      const displayName = line.split(',').pop();

      // 分组过滤或频道名包含过滤词，则跳过
      if (isMatch(groupName, groupFilters) || isMatch(displayName, channelFilters)) {
        i++; continue;
      }

      const url = lines[i+1] ? lines[i+1].trim() : "";
      if (url && url.startsWith('http') && !seen.has(url)) {
        const newName = normalizeName(displayName);
        // 重构标签，确保 group-title 和台标名正确
        let newInf = line.replace(displayName, newName);
        result.push(newInf, url);
        seen.add(url);
        i++;
      }
    }
  }
  return result.join('\n');
}

function processTxt(content) {
  const lines = content.split('\n');
  const resLines = [];
  let skipG = false;
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (t.includes(',#genre#')) {
      skipG = isMatch(t.split(',')[0], groupFilters);
      if (!skipG) resLines.push(t);
    } else if (t.includes(',') && !skipG) {
      const [name, url] = t.split(',');
      if (!isMatch(name, channelFilters)) {
        resLines.push(`${normalizeName(name)},${url}`);
      }
    }
  }
  return globalSortChannels(resLines).join('\n');
}

let content = global.YYKM.fetch(global.params.url);
if (!content) return "";

const format = content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
content = (format === 'M3U') ? processM3u(content) : processTxt(content);

// 参数替换
const rep = global.params.replace;
if (typeof rep === "string") {
  rep.split(";").forEach(r => {
    const [f, t] = r.split("->");
    if (f && t) content = content.replaceAll(f, t);
  });
}

return content;
})();