// ==================== 规则配置区域 ====================
const RULES_CONFIG = {
  EXTERNAL_RULES_URL: 'https://raw.githubusercontent.com/dududedaxiong/-/refs/heads/main/空蒙替换规则.txt',
  DEFAULT_GROUP_FILTERS: ['公告', '说明', '温馨', 'Information', '机场', 'TG频道'],
  DEFAULT_CHANNEL_FILTERS: ['t.me', 'TG群', '提醒', '不正确', '更新', '下载', '维护', '打赏', '支持', '好用', '提示', '温馨', 'HTTP'],
  DEFAULT_EPG_URL: 'https://ghfast.top/https://raw.githubusercontent.com/plsy1/epg/main/e/seven-days.xml.gz',
  DEFAULT_LOGO_URL_TEMPLATE: 'https://gcore.jsdelivr.net/gh/taksssss/tv/icon/{channel_name}.png',
  DEFAULT_UA: '',
  DEFAULT_CATCHUP_SOURCE: '',
  CCTV_CHANNEL_KEYWORDS: ['cctv', 'cetv', 'cgtn'],
  SPECIAL_CHANNEL_MAPPING: {}
};
// ==================== 规则配置区域结束 ====================

(() => {
  const global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this;

  let groupFilters = RULES_CONFIG.DEFAULT_GROUP_FILTERS;
  let channelFilters = RULES_CONFIG.DEFAULT_CHANNEL_FILTERS;
  let epgUrl = RULES_CONFIG.DEFAULT_EPG_URL;
  let logoUrlTemplate = RULES_CONFIG.DEFAULT_LOGO_URL_TEMPLATE;
  let defaultUA = RULES_CONFIG.DEFAULT_UA;
  let catchupSource = RULES_CONFIG.DEFAULT_CATCHUP_SOURCE;

  // 加载外部规则(同步方式)
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
            groupFilters = trimmed.replace('GROUP_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
           else if (trimmed.startsWith('CHANNEL_FILTERS=')) {
            channelFilters = trimmed.replace('CHANNEL_FILTERS=', '').split('|').map(f => f.trim()).filter(f => f);
          } else if (trimmed.startsWith('EPG_URL=')) {
            epgUrl = trimmed.replace('EPG_URL=', '').trim();
          } else if (trimmed.startsWith('LOGO_URL_TEMPLATE=')) {
            logoUrlTemplate = trimmed.replace('LOGO_URL_TEMPLATE=', '').trim();
          } else if (trimmed.startsWith('DEFAULT_UA=')) {
            defaultUA = trimmed.replace('DEFAULT_UA=', '').trim();
          } else if (trimmed.startsWith('CATCHUP_SOURCE=')) {
            catchupSource = trimmed.replace('CATCHUP_SOURCE=', '').trim();
          }
        }

        console.log('✓ 外部规则加载成功');
        return true;
      } else {
        console.warn('⚠ 外部规则加载失败,使用默认规则');
        return false;
      }
    } catch (e) {
      console.warn('⚠ 外部规则加载异常,使用默认规则:', e.message);
      return false;
    }
  }

  // 加载规则，失败时使用默认规则
  loadExternalRules();

  const CCTV_CHANNEL_KEYWORDS = RULES_CONFIG.CCTV_CHANNEL_KEYWORDS;
  const SPECIAL_CHANNEL_MAPPING = RULES_CONFIG.SPECIAL_CHANNEL_MAPPING;

  function normalizeCCTVName(name) {
    const trimmed = name.trim();
    const match = trimmed.match(/^(cctv|cetv|cgtn)[\s-]*(\d+)(.*?)$/i);
    if (match) {
      const prefix = match[1].toUpperCase();
      const number = match[2];
      const suffix = match[3].trim();
      return suffix ? `${prefix}-${number} ${suffix}` : `${prefix}-${number}`;
    }
    return null;
  }

  function includesAnyKeyword(name, keywords) {
    return keywords.some(keyword => name.toLowerCase().includes(keyword));
  }

  function getChannelType(groupName) {
    if (groupName.includes('CCTV') || groupName.includes('CETV') || groupName.includes('CGTN')) {
      return 'CCTV';
    } else if (groupName.includes('卫视')) {
      return '卫视';
    }
    return '其他';
  }

  function extractNumber(name) {
    const match = name.match(/[\s-]?(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  const globalSortChannels = (lines) => {
    const grouped = {};
    const groupOrder = [];
    let currentGroup = null;

    for (const line of lines) {
      if (line.match(/^.+,#genre#$/)) {
        const groupName = line.split(',')[0].trim();
        if (!grouped[groupName]) {
          grouped[groupName] = [];
          groupOrder.push(groupName);
        }
        currentGroup = groupName;
      } else if (line.match(/^.+,.+$/) && currentGroup) {
        grouped[currentGroup].push(line);
      }
    }

    for (const groupName in grouped) {
      grouped[groupName].sort((a, b) => {
        const nameA = a.split(',')[0].trim();
        const nameB = b.split(',')[0].trim();
        const numA = extractNumber(nameA);
        const numB = extractNumber(nameB);

        if (numA !== Infinity && numB !== Infinity) {
          return numA - numB;
        }
        return nameA.localeCompare(nameB, 'zh-CN');
      });
    }

    const typeGroups = { 'CCTV': [], '卫视': [], '其他': [] };
    for (const groupName of groupOrder) {
      const type = getChannelType(groupName);
      typeGroups[type].push(groupName);
    }

    const result = [];
    for (const type of ['CCTV', '卫视', '其他']) {
      for (const groupName of typeGroups[type]) {
        result.push(`${groupName},#genre#`);
        result.push(...grouped[groupName]);
      }
    }
    return result;
  };

  function fixNameWithEmbeddedUrl(channel) {
    if (channel.name && channel.name.includes('http')) {
      const parts = channel.name.split('http');
      channel.name = parts[0].trim();
      if (!channel.url && parts.length > 1) {
        channel.url = 'http' + parts[1];
      }
    }
  }

  function shouldFilterChannel(channel) {
    const name = typeof channel === 'string' ? channel : channel.name;
    return channelFilters.some(filter => name.includes(filter));
  }

  const transformChannel = (channel) => {
    fixNameWithEmbeddedUrl(channel);
    if (shouldFilterChannel(channel)) return undefined;
    if (SPECIAL_CHANNEL_MAPPING[channel.name]) {
      return { ...SPECIAL_CHANNEL_MAPPING[channel.name], url: channel.url || null };
    }
    let newName = channel.name.trim();
    if (includesAnyKeyword(channel.name, CCTV_CHANNEL_KEYWORDS)) {
      const normalized = normalizeCCTVName(channel.name);
      if (normalized) newName = normalized;
    }
    return { name: newName, url: channel.url || null };
  };

  let content = global.YYKM.fetch(global.params.url);

  function shouldFilter(text) {
    return groupFilters.some(filter => text.includes(filter)) || channelFilters.some(filter => text.includes(filter));
  }

  function detectFormat(content) {
    return content.trim().startsWith('#EXTM3U') ? 'M3U' : 'TXT';
  }

  function generateLogoUrl(channelName) {
    if (!logoUrlTemplate) return '';
    return logoUrlTemplate.replace('{channel_name}', encodeURIComponent(channelName));
  }

  function buildM3uHeader() {
    let header = '#EXTM3U';
    if (epgUrl) {
      header += ` x-tvg-url="${epgUrl}"`;
    }
    if (defaultUA) {
      header += ` http-user-agent="${defaultUA}"`;
    }
    if (catchupSource) {
      header += ` catchup="append" catchup-source="${catchupSource}"`;
    }
    return header;
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
      } else if (trimmedLine.match(/^.+,.+$/)) {
        if (skipCurrentGroup || shouldFilter(trimmedLine)) continue;
        const parts = trimmedLine.split(',');
        const transformed = transformChannel({ name: parts[0].trim(), url: parts[1].trim() });
        if (transformed) {
          const transformedLine = `${transformed.name},${transformed.url}`;
          if (!seen.has(transformedLine)) {
            seen.add(transformedLine);
            result.push(transformedLine);
          }
        }
      }
    }

    const sortedResult = globalSortChannels(result);
    return sortedResult.join('\n');
  }

  function convertTxtToM3u(txtContent) {
    const lines = txtContent.split('\n');
    const result = [buildM3uHeader()];
    const seen = new Set();
    let currentGroup = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (trimmedLine.match(/^.+,#genre#$/)) {
        const groupName = trimmedLine.split(',')[0].trim();
        currentGroup = groupName;
      } else if (trimmedLine.match(/^.+,.+$/) && currentGroup) {
        const parts = trimmedLine.split(',');
        const channelName = parts[0].trim();
        const url = parts[1].trim();

        const logoUrl = generateLogoUrl(channelName);
        let extinf = `#EXTINF:-1 tvg-name="${channelName}" group-title="${currentGroup}"`;
        
        if (logoUrl) {
          extinf += ` tvg-logo="${logoUrl}"`;
        }
        extinf += `,${channelName}`;

        if (!seen.has(extinf)) {
          seen.add(extinf);
          result.push(extinf);
          result.push(url);
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
    let pendingExtinf = null;
    let headerProcessed = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      if (trimmedLine.startsWith('#EXTM3U')) {
        if (!headerProcessed) {
          result.push(buildM3uHeader());
          headerProcessed = true;
        }
        continue;
      }

      if (trimmedLine.startsWith('#EXTINF')) {
        skipNextUrl = shouldFilter(trimmedLine);

        if (!skipNextUrl) {
          const displayName = trimmedLine.split(',').pop();
          const transformed = transformChannel({ name: displayName, url: null });

          if (transformed) {
            let newExtinf = trimmedLine.replace(displayName, transformed.name);

            const logoUrl = generateLogoUrl(transformed.name);
            if (logoUrl && !newExtinf.includes('tvg-logo=')) {
              newExtinf = newExtinf.replace('#EXTINF:-1', `#EXTINF:-1 tvg-logo="${logoUrl}"`);
            }

            pendingExtinf = newExtinf;
          } else {
            skipNextUrl = true;
          }
        }
      } else if (!trimmedLine.startsWith('#') && trimmedLine) {
        if (!skipNextUrl && pendingExtinf !== null) {
          if (!seen.has(pendingExtinf)) {
            seen.add(pendingExtinf);
            result.push(pendingExtinf);
          }

          if (!seen.has(trimmedLine)) {
            seen.add(trimmedLine);
            result.push(trimmedLine);
          }

          pendingExtinf = null;
        } else if (skipNextUrl) {
          pendingExtinf = null;
        

        skipNextUrl = false;
      }
    }

    return result.join('\n');
  }

  // 流程：加载规则 -> 获取源 -> 判定源格式 -> 条件处理
  const format = detectFormat(content);

  if (format === 'TXT') {
    // TXT格式：过滤 -> 排序 -> 转M3U -> 直接输出
    content = processTxtFormat(content);  // 过滤排序
    content = convertTxtToM3u(content);   // 转M3U
    // 直接返回，跳过后续处理
  } else {
    // M3U格式：进行过滤、补全、排序
    content = processM3uFormat(content);
  }

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