import { els, el, ICON, iconButton, toast } from './dom.js';
import { state, local, normalizeParserRule } from './store.js';
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
    const guardNote = rule.guard ? ' · 拦截弹窗' : '';
    info.append(
      el('div', 'parser-rule-name', rule.name),
      el(
        'div',
        'parser-rule-meta',
        `v${rule.version} · ${rule.matches.join(' · ')} · ${rule.fields.length} 个字段${guardNote}`,
      ),
    );

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
