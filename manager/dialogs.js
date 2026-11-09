import { els, el, ICON, iconButton, toast } from './dom.js';
import { state, local, normalizeParserRule } from './store.js';
import { guardConfigOf, injectGuard } from '../shared/guard.js';
import { badgeConfigOf, injectBadges } from '../shared/badges.js';
import { normalizeRule } from '../shared/url-rules.js';
import { render, renderRangeNotice } from './views.js';

export function openSettings() {
  clearRuleError();
  els.ruleInput.value = '';
  renderRuleList();
  if (!els.settings.open) els.settings.showModal();
  requestAnimationFrame(() => els.ruleInput.focus());
}

export function renderRuleList() {
  els.ruleList.replaceChildren();

  if (!state.rules.length) {
    els.ruleList.append(el('p', 'rule-empty', '还没有规则。添加后，只有列出的网址可以收藏。'));
    return;
  }

  for (const rule of state.rules) {
    const row = el('div', 'rule-item');
    const label = el('span', 'rule-label', rule);
    label.title = rule;
    row.append(label, iconButton('删除规则', ICON.trash, () => removeRule(rule), 'is-danger'));
    els.ruleList.append(row);
  }
}

export async function addRule() {
  clearRuleError();
  const rule = normalizeRule(els.ruleInput.value);
  if (!rule) {
    showRuleError('请输入有效域名或网址，例如 example.com');
    return;
  }
  if (state.rules.includes(rule)) {
    showRuleError('这条规则已经存在');
    return;
  }

  await saveRules([...state.rules, rule]);
  els.ruleInput.value = '';
  els.ruleInput.focus();
}

async function removeRule(rule) {
  await saveRules(state.rules.filter((value) => value !== rule));
  els.ruleInput.focus();
}

async function saveRules(rules) {
  state.rules = rules;
  render();
  renderRangeNotice();
  renderRuleList();
  try {
    const { settings } = await local.get('settings');
    await local.set({ settings: { ...(settings || {}), whitelist: rules } });
  } catch (error) {
    toast('保存设置失败：' + (error && error.message ? error.message : '未知错误'), { tone: 'error' });
  }
}

function showRuleError(message) {
  els.ruleError.textContent = message;
  els.ruleError.hidden = false;
}

export function clearRuleError() {
  els.ruleError.hidden = true;
}

export function openRulesDialog() {
  clearParserRuleError();
  renderParserRules();
  if (!els.rulesDialog.open) els.rulesDialog.showModal();
}

export function renderParserRules() {
  els.parserRuleList.replaceChildren();

  if (!state.parserRules.length) {
    els.parserRuleList.append(
      el('p', 'rule-empty', '还没有导入解析规则。导入后，匹配网站上的快速收藏会自动提取字段。'),
    );
    return;
  }

  for (const rule of state.parserRules) {
    const row = el('div', 'rule-item');
    const info = el('div', 'parser-rule-info');
    const guardNote = rule.guard ? ' · 已配置弹窗守卫' : '';
    const badgeNote = rule.badges ? ' · 已配置收藏角标' : '';
    info.append(
      el('div', 'parser-rule-name', rule.name),
      el(
        'div',
        'parser-rule-meta',
        `v${rule.version} · ${rule.matches.join(' · ')} · ${rule.fields.length} 个字段${guardNote}${badgeNote}`,
      ),
    );

    // 守卫状态：需要该站点的主机权限才能注入
    const guard = el('div', 'rule-guard');
    info.append(guard);
    renderGuardState(rule, guard);

    const remove = el('button', 'icon-btn is-danger');
    remove.type = 'button';
    remove.title = '删除规则';
    remove.setAttribute('aria-label', `删除规则 ${rule.name}`);
    remove.innerHTML = ICON.trash;
    remove.addEventListener('click', () => removeParserRule(rule.id));

    row.append(info, remove);
    els.parserRuleList.append(row);
  }
}

/** 规则对应的主机权限（http / https 都可能用到） */
function originPatternsOf(rule) {
  const hosts = new Set();
  for (const match of rule.matches || []) {
    const host = String(match).split('/')[0].replace(/^\*\./, '').trim();
    if (!host || host === '*' || host.includes('*')) continue;
    hosts.add(host);
  }
  return [...hosts].flatMap((host) => [`https://${host}/*`, `http://${host}/*`]);
}

async function grantedOriginOf(rule) {
  if (!chrome.permissions) return '';
  for (const pattern of originPatternsOf(rule)) {
    try {
      if (await chrome.permissions.contains({ origins: [pattern] })) return pattern;
    } catch {
      // 忽略
    }
  }
  return '';
}

async function renderGuardState(rule, container) {
  container.replaceChildren();
  const granted = await grantedOriginOf(rule);
  if (granted) {
    container.append(
      el(
        'span',
        'rule-guard-text is-on',
        rule.badges ? '弹窗守卫与收藏角标：已启用' : '弹窗守卫：已启用',
      ),
    );
    return;
  }

  container.append(el('span', 'rule-guard-text', '页面注入：未授权该站点'));
  const button = el('button', 'rule-guard-btn', '授权并启用');
  button.type = 'button';
  button.title = '授予该站点的主机权限，扩展才能注入弹窗守卫和收藏角标';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const patterns = originPatternsOf(rule);
      if (!patterns.length) {
        toast('这条规则没有可用的站点范围');
        return;
      }
      const ok = await chrome.permissions.request({ origins: patterns });
      if (!ok) {
        toast('未授权，页面注入不会生效');
        return;
      }
      await injectAssistIntoTabs(rule);
      toast(rule.badges ? '已启用弹窗守卫和收藏角标' : '已启用弹窗守卫');
      renderGuardState(rule, container);
    } catch (error) {
      toast('授权失败：' + (error && error.message ? error.message : '未知错误'));
    } finally {
      button.disabled = false;
    }
  });
  container.append(button);
}

/** 把守卫和角标立刻注入到已经打开的该站点页面 */
async function injectAssistIntoTabs(rule) {
  const patterns = originPatternsOf(rule);
  const hosts = patterns.map((pattern) => pattern.replace(/^https?:\/\//, '').replace(/\/\*$/, ''));
  const guardConfig = guardConfigOf(rule);
  const badgeConfig = badgeConfigOf(rule);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    let host = '';
    try {
      host = new URL(tab.url).hostname;
    } catch {
      continue;
    }
    if (!hosts.some((name) => host === name || host.endsWith('.' + name))) continue;
    try {
      if (badgeConfig) await injectBadges(tab.id, badgeConfig);
      await injectGuard(tab.id, guardConfig);
    } catch {
      // 单个标签页失败不影响其它
    }
  }
}

async function saveParserRules(rules) {
  state.parserRules = rules;
  renderParserRules();
  try {
    await local.set({ parserRules: rules });
  } catch (error) {
    toast('保存规则失败：' + (error && error.message ? error.message : '未知错误'), { tone: 'error' });
  }
}

export async function importParserRules(file) {
  clearParserRuleError();

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showParserRuleError('导入失败：不是有效的 JSON 文件');
    return;
  }

  const incoming = Array.isArray(data)
    ? data
    : Array.isArray(data && data.rules)
      ? data.rules
      : [data];
  const normalized = incoming.map(normalizeParserRule).filter(Boolean);

  if (!normalized.length) {
    showParserRuleError('导入失败：没有找到有效规则（需要 id、name、matches、fields）');
    return;
  }

  const rules = state.parserRules.slice();
  let updated = 0;
  for (const rule of normalized) {
    const index = rules.findIndex((entry) => entry.id === rule.id);
    if (index >= 0) {
      rules[index] = rule;
      updated += 1;
    } else {
      rules.push(rule);
    }
  }

  await saveParserRules(rules);
  toast(`已导入 ${normalized.length} 条解析规则${updated ? `（更新 ${updated} 条）` : ''}`);
}

async function removeParserRule(id) {
  await saveParserRules(state.parserRules.filter((rule) => rule.id !== id));
  toast('已删除解析规则');
}

function showParserRuleError(message) {
  els.parserRuleError.textContent = message;
  els.parserRuleError.hidden = false;
}

function clearParserRuleError() {
  els.parserRuleError.hidden = true;
}
