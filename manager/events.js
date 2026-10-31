import { dedupeTags, els, hostOf, normalizeUrl, scrollMainTop, toast } from './dom.js';
import { local, normalizeAvatars, normalizeItems, readParserRules, readRules, session, state, upsert } from './store.js';
import { jumpToPage, render, renderMain, renderRangeNotice, setView } from './views.js';
import { clearUrlError, collectMeta, flushTagInput, renderTagEditor, showUrlError } from './editor.js';
import { addRule, clearRuleError, importParserRules, openRulesDialog, openSettings, renderParserRules, renderRuleList } from './dialogs.js';
import { openSyncDialog, renderSyncStatus, runPhoneSync, syncUrlValue } from './sync.js';
import { applyImport, exportBackup, importBackup } from './backup.js';
import { backupNow, chooseBackupFolder, clearBackupFolder, openBackupDialog } from './backup-settings.js';
import { handleBlocked, onAddCurrent } from './actions.js';
import { openRandom } from './items.js';
import { openTagsDialog } from './tags.js';
import { clearSelected, deleteSelected, exitSelecting, selectAllOnPage, toggleSelecting, toggleSort } from './list-tools.js';
import { isAllowed } from '../shared/url-rules.js';

export function bindEvents() {
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    state.page = 1;
    clearSelected();
    renderMain();
  });

  els.tabLibrary.addEventListener('click', () => setView('library'));
  els.tabActresses.addEventListener('click', () => setView('actresses'));
  els.tabFavorites.addEventListener('click', () => setView('favorites'));
  els.clearActress.addEventListener('click', () => {
    state.actress = null;
    state.page = 1;
    render();
  });

  els.pagerPrev.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    clearSelected();
    renderMain();
    scrollMainTop();
  });

  els.pagerNext.addEventListener('click', () => {
    if (els.pagerNext.disabled) return;
    state.page += 1;
    clearSelected();
    renderMain();
    scrollMainTop();
  });

  els.pagerGo.addEventListener('click', jumpToPage);
  els.pagerJump.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToPage();
    }
  });
  els.pagerJump.addEventListener('focus', () => els.pagerJump.select());

  els.addCurrent.addEventListener('click', onAddCurrent);
  els.randomBtn.addEventListener('click', openRandom);

  els.sortToggle.addEventListener('click', toggleSort);
  els.selectToggle.addEventListener('click', toggleSelecting);
  els.selectionAll.addEventListener('click', selectAllOnPage);
  els.selectionDelete.addEventListener('click', deleteSelected);
  els.selectionCancel.addEventListener('click', exitSelecting);

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');

    if ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey) && !event.altKey) {
      event.preventDefault();
      els.search.focus();
      els.search.select();
    } else if (event.key === '/' && !typing) {
      event.preventDefault();
      els.search.focus();
    } else if (event.key === 'Escape' && document.activeElement === els.search) {
      els.search.value = '';
      state.query = '';
      state.page = 1;
      renderMain();
      els.search.blur();
    }
  });

  els.editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    flushTagInput();

    const url = normalizeUrl(els.fUrl.value);
    if (!url) {
      showUrlError(els.fUrl.value.trim() ? '只支持 http / https 网址' : '请输入要收藏的网址');
      els.fUrl.focus();
      return;
    }

    const editingUrl = state.editing ? state.editing.url : null;
    if (url !== editingUrl && !isAllowed(url, state.rules)) {
      showUrlError(state.rules.length
        ? '该网址不在收藏范围内，可在设置中添加对应规则'
        : '尚未配置收藏范围，请先在设置中添加允许的网站');
      return;
    }

    const title = els.fTitle.value.trim() || hostOf(url);
    const meta = collectMeta();
    const result = await upsert({
      id: state.editing ? state.editing.id : null,
      url,
      title,
      tags: dedupeTags(state.draftTags),
      extras: meta.extras,
      cover: meta.cover,
      source: state.draftSource,
    });

    els.editor.close();
    if (result === 'added') {
      els.search.value = '';
      state.query = '';
      state.tag = null;
      state.page = 1;
    }
    render();
    toast(result === 'added' ? '已收藏' : '已更新收藏');
  });

  els.fUrl.addEventListener('input', clearUrlError);

  els.cancelBtn.addEventListener('click', () => els.editor.close());

  els.editor.addEventListener('click', (event) => {
    if (event.target === els.editor) els.editor.close();
  });

  els.editor.addEventListener('close', () => {
    state.editing = null;
    state.draftTags = [];
    state.draftExtras = [];
    state.draftCover = '';
    state.draftSource = null;
  });

  els.fTag.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      if (els.fTag.value.trim()) {
        event.preventDefault();
        flushTagInput();
      }
    } else if (event.key === ',' || event.key === '，') {
      event.preventDefault();
      flushTagInput();
    } else if (event.key === 'Backspace' && !els.fTag.value && state.draftTags.length) {
      state.draftTags.pop();
      renderTagEditor();
    }
  });

  els.tagEditor.addEventListener('click', (event) => {
    if (event.target === els.tagEditor || event.target === els.tagChips) els.fTag.focus();
  });

  els.settingsBtn.addEventListener('click', openSettings);
  els.noticeConfig.addEventListener('click', openSettings);
  els.settingsDone.addEventListener('click', () => els.settings.close());
  els.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addRule();
  });
  els.ruleInput.addEventListener('input', clearRuleError);
  els.settings.addEventListener('click', (event) => {
    if (event.target === els.settings) els.settings.close();
  });

  els.syncBtn.addEventListener('click', openSyncDialog);
  els.syncForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = syncUrlValue(els.syncUrl.value);
    if (!url) {
      toast('服务地址需要是 http(s) 地址', { tone: 'error' });
      return;
    }
    const rawPublic = els.syncPublicUrl.value.trim();
    const publicUrl = rawPublic ? syncUrlValue(rawPublic) : '';
    if (rawPublic && !publicUrl) {
      toast('手机访问地址需要是 http(s) 地址', { tone: 'error' });
      return;
    }
    const token = els.syncToken.value.trim();
    if (!token) {
      toast('请填写访问令牌', { tone: 'error' });
      return;
    }

    await local.set({ syncSettings: { url, publicUrl: publicUrl || '', token } });
    toast('同步设置已保存');
    runPhoneSync();
  });
  els.syncNow.addEventListener('click', runPhoneSync);
  els.syncOpen.addEventListener('click', () => {
    const publicUrl = syncUrlValue(els.syncPublicUrl.value);
    if (!publicUrl) {
      toast('先填写手机访问地址', { tone: 'error' });
      return;
    }
    chrome.tabs.create({ url: publicUrl });
  });
  els.syncDialog.addEventListener('click', (event) => {
    if (event.target === els.syncDialog) els.syncDialog.close();
  });

  els.rulesBtn.addEventListener('click', openRulesDialog);
  els.tagsBtn.addEventListener('click', openTagsDialog);
  els.rulesDone.addEventListener('click', () => els.rulesDialog.close());
  els.rulesForm.addEventListener('submit', (event) => event.preventDefault());
  els.importRuleBtn.addEventListener('click', () => els.importRuleFile.click());
  els.importRuleFile.addEventListener('change', async () => {
    const file = els.importRuleFile.files && els.importRuleFile.files[0];
    if (file) await importParserRules(file);
    els.importRuleFile.value = '';
  });
  els.rulesDialog.addEventListener('click', (event) => {
    if (event.target === els.rulesDialog) els.rulesDialog.close();
  });

  els.tagsDone.addEventListener('click', () => els.tagsDialog.close());
  els.tagsForm.addEventListener('submit', (event) => event.preventDefault());
  els.tagsDialog.addEventListener('click', (event) => {
    if (event.target === els.tagsDialog) els.tagsDialog.close();
  });

  els.importMerge.addEventListener('click', () => applyImport('merge'));
  els.importReplace.addEventListener('click', () => applyImport('replace'));
  els.importForm.addEventListener('submit', (event) => event.preventDefault());
  els.importDialog.addEventListener('close', () => {
    state.pendingImport = null;
  });
  els.importCancel.addEventListener('click', () => {
    state.pendingImport = null;
    els.importDialog.close();
  });
  els.importDialog.addEventListener('click', (event) => {
    if (event.target === els.importDialog) {
      state.pendingImport = null;
      els.importDialog.close();
    }
  });

  els.exportBtn.addEventListener('click', exportBackup);

  els.backupBtn.addEventListener('click', openBackupDialog);
  els.chooseFolderBtn.addEventListener('click', chooseBackupFolder);
  els.clearFolderBtn.addEventListener('click', clearBackupFolder);
  els.backupNow.addEventListener('click', backupNow);
  els.backupDone.addEventListener('click', () => els.backupDialog.close());
  els.backupForm.addEventListener('submit', (event) => event.preventDefault());
  els.backupDialog.addEventListener('click', (event) => {
    if (event.target === els.backupDialog) els.backupDialog.close();
  });

  els.importBtn.addEventListener('click', () => els.importFile.click());

  els.importFile.addEventListener('change', async () => {
    const file = els.importFile.files && els.importFile.files[0];
    if (file) await importBackup(file);
    els.importFile.value = '';
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.items) {
      state.items = normalizeItems(changes.items.newValue);
      render();
    }
    if (areaName === 'local' && changes.actressAvatars) {
      state.actressAvatars = normalizeAvatars(changes.actressAvatars.newValue);
      if (state.view === 'actresses') render();
    }
    if (areaName === 'local' && changes.settings) {
      state.rules = readRules(changes.settings.newValue);
      render();
      renderRangeNotice();
      if (els.settings.open) renderRuleList();
    }
    if (areaName === 'local' && changes.parserRules) {
      state.parserRules = readParserRules(changes.parserRules.newValue);
      if (els.rulesDialog.open) renderParserRules();
    }
    if (areaName === 'local' && changes.syncStatus && els.syncDialog.open) {
      renderSyncStatus(changes.syncStatus.newValue || null);
    }
    if (areaName === 'session' && changes.lastTab) {
      state.lastTab = changes.lastTab.newValue || null;
    }
    if (areaName === 'session' && changes.pendingBlocked && changes.pendingBlocked.newValue) {
      session.remove('pendingBlocked');
      handleBlocked(changes.pendingBlocked.newValue);
    }
  });
}
