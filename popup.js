class PopupController {
  constructor() {
    this.currentTab = null;
    this.currentDomain = null;
    this.whitelistedDomains = [];
    this.disabledSites = [];
    this.isWhitelisted = false;
    this.isEnabled = true;
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
      this.currentDomain = new URL(tab.url).hostname;
      document.getElementById('current-site').textContent = `現在のサイト: ${this.currentDomain}`;
    } catch (error) {
      console.error('Failed to get current tab:', error);
      document.getElementById('current-site').textContent = '現在のサイト: 取得できませんでした';
    }
  }

  async loadSettings() {
    try {
      const data = await chrome.storage.local.get(['whitelistedDomains', 'disabledSites']);
      this.whitelistedDomains = data.whitelistedDomains || [];
      this.disabledSites = data.disabledSites || [];

      this.isWhitelisted = this.whitelistedDomains.includes(this.currentDomain);
      // ホワイトリストになく、かつ、無効サイトリストにもない場合のみ有効
      this.isEnabled = !this.isWhitelisted && !this.disabledSites.includes(this.currentDomain);

    } catch (error) {
      console.error('Failed to load settings:', error);
      this.isEnabled = true;
      this.isWhitelisted = false;
    }
  }

  async saveSettings() {
    try {
      // サイトごとのON/OFF設定を保存
      if (this.isEnabled) {
        this.disabledSites = this.disabledSites.filter(d => d !== this.currentDomain);
      } else {
        if (!this.disabledSites.includes(this.currentDomain)) {
          this.disabledSites.push(this.currentDomain);
        }
      }
      await chrome.storage.local.set({ disabledSites: this.disabledSites });
    } catch (error) {
      console.error('Failed to save site settings:', error);
    }
  }

  async toggleWhitelist() {
    this.isWhitelisted = !this.isWhitelisted;
    if (this.isWhitelisted) {
      if (!this.whitelistedDomains.includes(this.currentDomain)) {
        this.whitelistedDomains.push(this.currentDomain);
      }
    } else {
      this.whitelistedDomains = this.whitelistedDomains.filter(d => d !== this.currentDomain);
    }

    try {
      await chrome.storage.local.set({ whitelistedDomains: this.whitelistedDomains });
      this.isEnabled = !this.isWhitelisted;
      this.updateUI();
      this.notifyContentScript();
    } catch (error) {
      console.error('Failed to save whitelist settings:', error);
    }
  }

  setupEventListeners() {
    const siteToggle = document.getElementById('site-toggle');
    siteToggle.addEventListener('change', async (e) => {
      this.isEnabled = e.target.checked;
      await this.saveSettings();
      this.notifyContentScript();
      this.updateToggleLabel();
    });

    document.getElementById('whitelist-toggle').addEventListener('click', () => {
      this.toggleWhitelist();
    });

    document.getElementById('reset-site').addEventListener('click', () => {
      this.resetSiteSettings();
    });
  }

  updateUI() {
    const siteToggle = document.getElementById('site-toggle');
    const toggleLabel = document.getElementById('toggle-label');
    const whitelistButton = document.getElementById('whitelist-toggle');

    if (this.isWhitelisted) {
      siteToggle.checked = false;
      siteToggle.disabled = true;
      toggleLabel.textContent = 'このサイトはホワイトリスト登録済みです';
      toggleLabel.style.color = '#999';
      whitelistButton.textContent = 'このサイトをホワイトリストから削除';
      whitelistButton.classList.add('remove');
    } else {
      siteToggle.checked = this.isEnabled;
      siteToggle.disabled = false;
      this.updateToggleLabel();
      whitelistButton.textContent = 'このサイトをホワイトリストに追加';
      whitelistButton.classList.remove('remove');
    }

    this.updateBlockCount();
  }

  updateToggleLabel() {
    const label = document.getElementById('toggle-label');
    label.textContent = this.isEnabled ? 'このサイトでブロック' : 'このサイトでブロック停止';
    label.style.color = this.isEnabled ? '#333' : '#999';
  }

  async updateBlockCount() {
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, { action: 'getStats' });
      if (result && typeof result.blockedCount === 'number') {
        document.getElementById('block-count').textContent = `ブロック数: ${result.blockedCount}`;
      }
    } catch (error) {
      document.getElementById('block-count').textContent = 'ブロック数: -';
    }
  }

  async notifyContentScript() {
    try {
      // isEnabledは、ホワイトリストとサイトごと設定を両方反映した最終的な状態
      const finalEnabledState = !this.isWhitelisted && this.isEnabled;
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'toggleBlocking',
        enabled: finalEnabledState
      });
    } catch (error) {
      console.error('Failed to notify content script:', error);
    }
  }

  async resetSiteSettings() {
    try {
      // 両方の設定から現在のドメインを削除
      this.disabledSites = this.disabledSites.filter(d => d !== this.currentDomain);
      this.whitelistedDomains = this.whitelistedDomains.filter(d => d !== this.currentDomain);
      
      await chrome.storage.local.set({
        disabledSites: this.disabledSites,
        whitelistedDomains: this.whitelistedDomains
      });

      // ページをリロードして即時反映
      chrome.tabs.reload(this.currentTab.id);
      window.close();
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
