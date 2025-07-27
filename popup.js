class PopupController {
  constructor() {
    this.currentTab = null;
    this.currentDomain = null;
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
      
      // サイト情報を表示
      document.getElementById('current-site').textContent = 
        `現在のサイト: ${this.currentDomain}`;
    } catch (error) {
      console.error('Failed to get current tab:', error);
      document.getElementById('current-site').textContent = 
        '現在のサイト: 取得できませんでした';
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([this.currentDomain]);
      this.isEnabled = result[this.currentDomain] !== false; // デフォルトはtrue
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.isEnabled = true;
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        [this.currentDomain]: this.isEnabled
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  setupEventListeners() {
    // トグルスイッチ
    const toggle = document.getElementById('site-toggle');
    toggle.addEventListener('change', async (e) => {
      this.isEnabled = e.target.checked;
      await this.saveSettings();
      this.notifyContentScript();
      this.updateToggleLabel();
    });

    // リセットボタン
    document.getElementById('reset-site').addEventListener('click', () => {
      this.resetSiteSettings();
    });
  }

  updateUI() {
    const toggle = document.getElementById('site-toggle');
    toggle.checked = this.isEnabled;
    this.updateToggleLabel();
    this.updateBlockCount();
  }

  updateToggleLabel() {
    const label = document.getElementById('toggle-label');
    label.textContent = this.isEnabled ? 'このサイトでブロック' : 'このサイトでブロック停止';
    label.style.color = this.isEnabled ? '#333' : '#999';
  }

  async updateBlockCount() {
    try {
      const result = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getStats'
      });
      
      if (result && typeof result.blockedCount === 'number') {
        document.getElementById('block-count').textContent = 
          `ブロック数: ${result.blockedCount}`;
      }
    } catch (error) {
      // エラーは無視（ページがロードされていない可能性）
      document.getElementById('block-count').textContent = 'ブロック数: -';
    }
  }

  async notifyContentScript() {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'toggleBlocking',
        enabled: this.isEnabled
      });
    } catch (error) {
      console.error('Failed to notify content script:', error);
    }
  }


  async resetSiteSettings() {
    try {
      await chrome.storage.local.remove(this.currentDomain);
      this.isEnabled = true;
      this.updateUI();
      this.notifyContentScript();
      
      // ページをリロード
      chrome.tabs.reload(this.currentTab.id);
      window.close();
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }
}

// ポップアップが開かれたときに初期化
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});