// Background script for icon management and tab state tracking

class IconManager {
  constructor() {
    this.tabStates = new Map(); // tabId -> {enabled: boolean, domain: string}
    this.init();
  }

  init() {
    // Content scriptからのメッセージを監視
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // タブが切り替わった時にアイコンを更新
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.updateIconForTab(activeInfo.tabId);
    });

    // タブが更新された時にアイコンを更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        this.updateIconForTab(tabId);
      }
    });

    // タブが削除された時に状態をクリーンアップ
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabStates.delete(tabId);
    });
  }

  handleMessage(message, sender, sendResponse) {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    switch (message.action) {
      case 'updateTabState':
        this.updateTabState(tabId, message.enabled, message.domain);
        this.updateIconForTab(tabId);
        sendResponse({ success: true });
        break;

      case 'getTabState':
        const state = this.tabStates.get(tabId);
        sendResponse(state || { enabled: true, domain: null });
        break;
    }
  }

  updateTabState(tabId, enabled, domain) {
    this.tabStates.set(tabId, { enabled, domain });
    console.log(`Tab ${tabId} (${domain}): ${enabled ? 'enabled' : 'disabled'}`);
  }

  async updateIconForTab(tabId) {
    try {
      const state = this.tabStates.get(tabId);
      const enabled = state?.enabled ?? true; // デフォルトは有効

      const iconPath = enabled ? {
        "16": "icons/active-small.svg",
        "32": "icons/active-medium.svg",
        "48": "icons/active-large.svg",
        "128": "icons/active-xlarge.svg"
      } : {
        "16": "icons/inactive-small.svg",
        "32": "icons/inactive-medium.svg",
        "48": "icons/inactive-large.svg",
        "128": "icons/inactive-xlarge.svg"
      };

      const title = enabled ? 
        'MyAdBlock - 有効' : 
        'MyAdBlock - 無効';

      // アイコンとタイトルを更新
      await chrome.action.setIcon({ 
        tabId: tabId, 
        path: iconPath 
      });
      
      await chrome.action.setTitle({ 
        tabId: tabId, 
        title: title 
      });

    } catch (error) {
      console.warn('Failed to update icon:', error);
    }
  }

  // 現在のアクティブタブの状態を取得
  async getCurrentTabState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        return this.tabStates.get(tab.id) || { enabled: true, domain: null };
      }
    } catch (error) {
      console.warn('Failed to get current tab state:', error);
    }
    return { enabled: true, domain: null };
  }
}

// グローバルインスタンスを作成
const iconManager = new IconManager();

// 拡張機能がインストールされた時の初期設定
chrome.runtime.onInstalled.addListener(() => {
  console.log('MyAdBlock extension installed');
});