import { els, hostOf, normalizeUrl, scrollMainTop, toast } from './dom.js';
import { local, normalizeActressMeta, normalizeAvatars, normalizeItems, readParserRules, readRules, session, state, upsert } from './store.js';
import { jumpToPage, openFilterDialog, render, renderMain, renderRangeNotice, setView } from './views.js';
import { clearUrlError, collectMeta, showUrlError } from './editor.js';
import { addRule, clearRuleError, importParserRules, openRulesDialog, openSettings, renderParserRules, renderRuleList } from './dialogs.js';
import { openSyncDialog, renderSyncStatus, runPhoneSync, syncUrlValue } from './sync.js';
import { applyImport, exportBackup, importBackup } from './backup.js';
import { backupNow, chooseBackupFolder, clearBackupFolder, openBackupDialog } from './backup-settings.js';
import { closeDetail, detailCopyItem, detailEditItem, detailOpenItem, detailRelocateItem, detailRescanItem, handleDetailKey } from './detail.js';
import { openScrapeDialog, scrapeSelected, startScrapeAll } from './scrape.js';
import { handleBlocked, onAddCurrent } from './actions.js';
import { openRandom } from './items.js';
import { clearSelected, deleteSelected, exitSelecting, favoriteSelected, selectAllOnPage, setSort, toggleSelecting, watchedSelected } from './list-tools.js';
import { bindListKeys } from './keys.js';
import { isAllowed } from '../shared/url-rules.js';

export function bindEvents() {
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    state.page = 1;
    clearSelected();
    renderMain();
  });

  els.tabLibrary.addEventListener('click', () => setView('library'));
  els.tabCollections.addEventListener('click', () => setView('collections'));
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

  els.sortSelect.addEventListener('change', () => setSort(els.sortSelect.value));
  els.filterBtn.addEventListener('click', openFilterDialog);
  els.filterDone.addEventListener('click', () => els.filterDialog.close());
  els.filterDialog.addEventListener('click', (event) => {
    if (event.target === els.filterDialog) els.filterDialog.close();
  });
  els.selectToggle.addEventListener('click', toggleSelecting);
  els.selectionAll.addEventListener('click', selectAllOnPage);
  els.selectionFavorite.addEventListener('click', favoriteSelected);
  els.selectionWatched.addEventListener('click', watchedSelected);
  els.selectionScrape.addEventListener('click', scrapeSelected);
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
      tags: state.editing ? state.editing.tags : [],
      extras: meta.extras,
      cover: meta.cover,
      source: state.draftSource,
    });

    els.editor.close();
    if (result === 'added') {
      els.search.value = '';
      state.query = '';
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
    state.draftGenres = [];
    state.draftExtras = [];
    state.draftCover = '';
    state.draftSource = null;
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

  els.detailClose.addEventListener('click', closeDetail);
  els.detailDialog.addEventListener('click', (event) => {
    if (event.target === els.detailDialog) closeDetail();
  });
  els.detailDialog.addEventListener('close', closeDetail);
  els.detailOpen.addEventListener('click', detailOpenItem);
  els.detailCopy.addEventListener('click', detailCopyItem);
  els.detailEdit.addEventListener('click', detailEditItem);
  els.detailRescan.addEventListener('click', detailRescanItem);
  els.detailRelocate.addEventListener('click', detailRelocateItem);
  els.detailDialog.addEventListener('keydown', handleDetailKey);

  els.scrapeStart.addEventListener('click', startScrapeAll);
  els.scrapeClose.addEventListener('click', () => els.scrapeDialog.close());
  els.scrapeForm.addEventListener('submit', (event) => event.preventDefault());
  els.scrapeDialog.addEventListener('click', (event) => {
    if (event.target === els.scrapeDialog) els.scrapeDialog.close();
  });

  els.moreBtn.addEventListener('click', () => {
    if (!els.moreDialog.open) els.moreDialog.showModal();
    els.moreClose.focus();
  });
  const closeMore = () => els.moreDialog.close();
  els.moreClose.addEventListener('click', closeMore);
  els.moreDialog.addEventListener('click', (event) => {
    if (event.target === els.moreDialog) closeMore();
  });
  els.moreExport.addEventListener('click', () => {
    closeMore();
    exportBackup();
  });
  els.moreBackup.addEventListener('click', () => {
    closeMore();
    openBackupDialog();
  });
  els.moreImport.addEventListener('click', () => {
    closeMore();
    els.importFile.click();
  });
  els.moreRules.addEventListener('click', () => {
    closeMore();
    openRulesDialog();
  });
  els.moreScrape.addEventListener('click', () => {
    closeMore();
    openScrapeDialog();
  });
  els.moreSync.addEventListener('click', () => {
    closeMore();
    openSyncDialog();
  });

  els.chooseFolderBtn.addEventListener('click', chooseBackupFolder);
  els.clearFolderBtn.addEventListener('click', clearBackupFolder);
  els.backupNow.addEventListener('click', backupNow);
  els.backupDone.addEventListener('click', () => els.backupDialog.close());
  els.backupForm.addEventListener('submit', (event) => event.preventDefault());
  els.backupDialog.addEventListener('click', (event) => {
    if (event.target === els.backupDialog) els.backupDialog.close();
  });

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
    if (areaName === 'local' && changes.actressMeta) {
      state.actressMeta = normalizeActressMeta(changes.actressMeta.newValue);
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

  bindListKeys();
}
