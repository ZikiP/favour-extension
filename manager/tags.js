import { els, el, ICON, dedupeTags, toast } from './dom.js';
import { keep, state } from './store.js';
import { tagStats } from './selectors.js';
import { render } from './views.js';

export function openTagsDialog() {
  renderTagManager();
  if (!els.tagsDialog.open) els.tagsDialog.showModal();
  els.tagsDone.focus();
}

export function renderTagManager() {
  els.tagManageList.replaceChildren();
  const stats = tagStats();

  if (!stats.length) {
    els.tagManageList.append(el('p', 'rule-empty', '还没有标签。'));
    return;
  }

  for (const stat of stats) {
    const row = el('div', 'rule-item');
    const label = el('span', 'rule-label', stat.label);
    label.title = stat.label;

    const rename = el('button', 'icon-btn');
    rename.type = 'button';
    rename.title = '重命名标签';
    rename.setAttribute('aria-label', `重命名标签 ${stat.label}`);
    rename.innerHTML = ICON.pencil;
    rename.addEventListener('click', () => startRename(row, stat.label));

    const remove = el('button', 'icon-btn is-danger');
    remove.type = 'button';
    remove.title = '删除标签';
    remove.setAttribute('aria-label', `删除标签 ${stat.label}`);
    remove.innerHTML = ICON.trash;
    remove.addEventListener('click', () => removeTag(stat.label));

    row.append(label, el('span', 'tag-count', `${stat.count} 条`), rename, remove);
    els.tagManageList.append(row);
  }
}

function startRename(row, label) {
  const current = row.querySelector('.rule-label');
  if (!current) return;

  const input = el('input', 'tag-rename');
  input.type = 'text';
  input.value = label;
  input.maxLength = 30;
  input.spellcheck = false;
  current.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = async (apply) => {
    if (finished) return;
    finished = true;
    if (!apply) {
      renderTagManager();
      return;
    }
    if (!(await renameTag(label, input.value))) renderTagManager();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

async function renameTag(label, rawNext) {
  const next = String(rawNext || '').trim().replace(/\s+/g, ' ');
  if (!next) {
    toast('标签名不能为空', { tone: 'error' });
    return false;
  }
  if (next.length > 30) {
    toast('标签最多 30 个字符', { tone: 'error' });
    return false;
  }
  if (next.toLowerCase() === label.toLowerCase()) return true;

  const from = label.toLowerCase();
  const items = state.items.map((item) => (item.tags.some((tag) => tag.toLowerCase() === from)
    ? {
        ...item,
        tags: dedupeTags(item.tags.map((tag) => (tag.toLowerCase() === from ? next : tag))),
        updatedAt: Date.now(),
      }
    : item));

  await keep(items);
  render();
  renderTagManager();
  toast(`标签已改为「${next}」`);
  return true;
}

async function removeTag(label) {
  const key = label.toLowerCase();
  const items = state.items.map((item) => (item.tags.some((tag) => tag.toLowerCase() === key)
    ? {
        ...item,
        tags: item.tags.filter((tag) => tag.toLowerCase() !== key),
        updatedAt: Date.now(),
      }
    : item));

  await keep(items);
  render();
  renderTagManager();
  toast(`已删除标签「${label}」`);
}
