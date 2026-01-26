// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  // 本地保底过滤逻辑 (全模糊匹配)
  GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道', '最近更新', '冰茶'],
  CHANNEL_FILTERS: ['测试', '提示', '提醒', '温馨', '说明', '公告', '更新', 'TG', '电报', 'QQ', '微信', '下载', '密码不正确', '已隐藏'],
  
  // 分组大类排序权重 (参考 channelItemListProcessJs)
  GROUP_NAME_SORT: ['央视频道', '卫视频道', '地方频道', '高清频道', '港澳频道', '台湾频道', '其他频道', '有线频道', '体育频道']
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  // 1. 提取并规范化 CCTV 数字权重 (核心修复)
  function getCCTVNumber(name) {
    const match = name.match(/CCTV[\s-]*(\d+)/i); // 提取如 CCTV-4 中的 "4"
    return match ? parseInt(match[1], 10) : null;
  }

  // 2. 极致模糊匹配函数
  function isBad(text, filters) {
    if (!text) return false;
    const target = text.toLowerCase().replace(/\s+/g, '');
    return filters.some(f => target.includes(f.toLowerCase().replace(/\s+/g, '')));
  }

  // 3. 核心排序函数 (参考 channelItemListProcessJs)
  function sortChannels(channels) {
    return channels.sort((a, b) => {
      const numA = getCCTVNumber(a.name);
      const numB = getCCTVNumber(b.name);

      // 第一优先级：按台号数字排 (解决 CCTV-4 与 CCTV-13 的顺序)
      if (numA !== null && numB !== null) {
        if (numA !== numB) return numA - numB;
        // 第二优先级：数字相同时，按中文自然顺序排 (解决 CCTV-4 不同变体)
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      if (numA !== null) return -1;
      if (numB !== null) return 1;

      // 普通频道使用拼音/中文自然排序
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  // 4. M3U 格式解析与过滤
  function processM3U(content) {
    const lines = content.split('\n');
    const groups = {};
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF')) {
        const gMatch = line.match(/group-title="([^"]+)"/i);
        const groupName = gMatch ? gMatch[1] : "其他频道";
        const displayName = line.split(',').pop();
        const url = lines[i+1] ? lines[i+1].trim() : "";

        // 过滤逻辑：分组名或频道名包含过滤词
        if (isBad(groupName, RULES_CONFIG.GROUP_FILTERS) || isBad(displayName, RULES_CONFIG.CHANNEL_FILTERS)) {
          i++; continue;
        }

        if (url && url.startsWith('http') && !seen.has(url)) {
          if (!groups[groupName]) groups[groupName] = [];
          groups[groupName].push({ name: displayName, inf: line, url: url });
          seen.add(url);
          i++;
        }
      }
    }

    // 执行大类排序并生成内容
    let result = '#EXTM3U\n';
    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
      const wA = RULES_CONFIG.GROUP_ORDER_WEIGHT?.indexOf(a) ?? 99;
      const wB = RULES_CONFIG.GROUP_ORDER_WEIGHT?.indexOf(b) ?? 99;
      return wA - wB || a.localeCompare(b, 'zh-CN');
    });

    sortedGroupNames.forEach(gn => {
      const sortedList = (gn.includes('央视') || gn.includes('CCTV')) ? sortChannels(groups[gn]) : groups[gn].sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'));
      sortedList.forEach(ch => {
        result += `${ch.inf}\n${ch.url}\n`;
      });
    });
    return result;
  }

  // 5. TXT 格式解析与过滤
  function processTXT(content) {
    const lines = content.split('\n');
    const groups = {};
    let curG = "其他频道";
    let skipG = false;

    lines.forEach(line => {
      const t = line.trim();
      if (!t) return;
      if (t.includes(',#genre#')) {
        const gn = t.split(',')[0].trim();
        skipG = isBad(gn, RULES_CONFIG.GROUP_FILTERS);
        if (!skipG) {
          curG = gn;
          if (!groups[curG]) groups[curG] = [];
        }
      } else if (t.includes(',') && !skipG) {
        const [name, url] = t.split(',');
        if (url && url.startsWith('http') && !isBad(name, RULES_CONFIG.CHANNEL_FILTERS)) {
          groups[curG].push({ name, url });
        }
      }
    });

    let result = '';
    RULES_CONFIG.GROUP_NAME_SORT.forEach(gn => {
      if (groups[gn] && groups[gn].length > 0) {
        result += `${gn},#genre#\n`;
        const sortedList = (gn.includes('央视') || gn.includes('CCTV')) ? sortChannels(groups[gn]) : groups[gn].sort((a,b) => a.name.localeCompare(b.name, 'zh-CN'));
        sortedList.forEach(ch => result += `${ch.name},${ch.url}\n`);
      }
    });
    return result;
  }

  // --- 主逻辑 ---
  let content = global.YYKM.fetch(global.params.url);
  if (!content) return "";

  const isM3u = content.trim().startsWith('#EXTM3U');
  content = isM3u ? processM3U(content) : processTXT(content);

  // 最后执行 replace 替换
  const rep = global.params.replace;
  if (rep) {
    rep.split(";").forEach(r => {
      const [f, t] = r.split("->");
      if (f && t) content = content.replaceAll(f, t);
    });
  }

  return content;
})();