// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  // 分组过滤词 (全模糊匹配)
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '冰茶'],
  // 频道过滤词 (全模糊匹配)
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP', '密码不正确', '已隐藏'],
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  // 强制排序：定义分组的展示顺序
  GROUP_ORDER_WEIGHT: { 'CCTV': 1, '央视': 1, '卫视': 2, '其他': 3 }
};
// ==================== 规则配置区域结束 ====================

(() => {
const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

let groupFilters = new Set(RULES_CONFIG.DEFAULT_GROUP_FILTERS.map(f => f.toLowerCase()));
let channelFilters = new Set(RULES_CONFIG.DEFAULT_CHANNEL_FILTERS.map(f => f.toLowerCase()));

// 1. 同步加载外部规则
function loadRules() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', RULES_CONFIG.EXTERNAL_RULES_URL, false);
    xhr.send();
    if (xhr.status === 200 && xhr.responseText) {
      xhr.responseText.split('\n').forEach(line => {
        const t = line.trim();
        if (t.startsWith('GROUP_FILTERS=')) {
          t.replace('GROUP_FILTERS=', '').split('|').forEach(f => { if(f.trim()) groupFilters.add(f.trim().toLowerCase()); });
        } else if (t.startsWith('CHANNEL_FILTERS=')) {
          t.replace('CHANNEL_FILTERS=', '').split('|').forEach(f => { if(f.trim()) channelFilters.add(f.trim().toLowerCase()); });
        }
      });
    }
  } catch (e) {}
}
loadRules();

// 2. 极致模糊匹配判定
function isMatch(text, filterSet) {
  if (!text) return false;
  const target = text.toLowerCase().replace(/\s+/g, '');
  for (let f of filterSet) {
    if (target.includes(f.replace(/\s+/g, ''))) return true;
  }
  return false;
}

// 3. 频道名称规范化
function normalizeName(name) {
  let n = name.trim();
  const match = n.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    const num = match[2];
    const suffix = match[3].trim();
    // 统一格式为 CCTV-4 (带空格或后缀保留)
    return suffix ? `${prefix}-${num} ${suffix}` : `${prefix}-${num}`;
  }
  return n;
}

// 4. 【核心】提取频道权重，解决 CCTV-4 乱序问题
function getChannelWeight(name) {
  const n = name.toUpperCase().replace(/\s+/g, '');
  // 提取 CCTV/CETV/CGTN 后的数字
  const m = n.match(/(?:CCTV|CETV|CGTN)[\s-]*(\d+)/);
  if (m) {
    // 例如 CCTV-4 返回权重 4，CCTV-13 返回 13
    return parseInt(m[1], 10);
  }
  return 999; // 非数字频道排在后面
}

// 5. 全局排序处理
const globalSort = (lines) => {
  const grouped = {};
  const groupOrder = [];
  let currentGroup = null;

  lines.forEach(line => {
    if (line.match(/^.+,#genre#$/)) {
      currentGroup = line.split(',')[0].trim();
      if (!grouped[currentGroup]) {
        grouped[currentGroup] = [];
        groupOrder.push(currentGroup);
      }
    } else if (line.includes(',') && currentGroup) {
      grouped[currentGroup].push(line);
    }
  });

  // 组内排序
  for (const g in grouped) {
    grouped[g].sort((a, b) => {
      const nameA = a.split(',')[0];
      const nameB = b.split(',')[0];
      const weightA = getChannelWeight(nameA);
      const weightB = getChannelWeight(nameB);
      
      if (weightA !== weightB) return weightA - weightB; // 首先按台号数字排
      return nameA.localeCompare(nameB, 'zh-CN'); // 数字相同时按后缀字母/中文排
    });
  }

  // 分组大类排序 (央视 > 卫视 > 其他)
  const result = [];
  const getGroupTypeWeight = (gn) => {
    const upper = gn.toUpperCase();
    if (upper.includes('CCTV') || upper.includes('央视')) return 1;
    if (gn.includes('卫视')) return 2;
    return 3;
  };

  groupOrder.sort((a, b) => getGroupTypeWeight(a) - getGroupTypeWeight(b));

  groupOrder.forEach(gn => {
    result.push(`${gn},#genre#`);
    result.push(...grouped[gn]);
  });
  return result;
};

// 6. M3U 逻辑 (带分组识别)
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

      if (isMatch(groupName, groupFilters) || isMatch(displayName, channelFilters)) {
        i++; continue;
      }

      const url = lines[i+1] ? lines[i+1].trim() : "";
      if (url && url.startsWith('http') && !seen.has(url)) {
        const newName = normalizeName(displayName);
        result.push(line.replace(displayName, newName), url);
        seen.add(url);
        i++;
      }
    }
  }
  return result.join('\n');
}

// 7. TXT 逻辑
function processTxt(content) {
  const lines = content.split('\n');
  const resLines = [];
  let skipG = false;
  lines.forEach(l => {
    const t = l.trim();
    if (!t) return;
    if (t.includes(',#genre#')) {
      skipG = isMatch(t.split(',')[0], groupFilters);
      if (!skipG) resLines.push(t);
    } else if (t.includes(',') && !skipG) {
      const [name, url] = t.split(',');
      if (!isMatch(name, channelFilters)) {
        resLines.push(`${normalizeName(name)},${url}`);
      }
    }
  });
  return globalSort(resLines).join('\n');
}

// --- 主入口 ---
let content = global.YYKM.fetch(global.params.url);
if (!content) return "";

const format = content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
content = (format === 'M3U') ? processM3u(content) : processTxt(content);

// replace 参数替换
const rep = global.params.replace;
if (typeof rep === "string") {
  rep.split(";").forEach(r => {
    const [f, t] = r.split("->");
    if (f && t) content = content.replaceAll(f, t);
  });
}

return content;
})();