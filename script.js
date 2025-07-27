class AdBlocker {
    constructor() {
        this.adBlockCount = 0;
        this.timeoutId = null;
        this.lastExecTime = 0;
        this.processedElements = new WeakSet();
        this.isEnabled = true;
        this.currentDomain = window.location.hostname;
        
        // より厳密な広告検出パターン
        this.patterns = {
            // 広告関連のクラス名・ID（境界を明確に）
            ads: /\b(adsby|adsense|adserver|adspace|advert|advertisement|banner|popup|sponsor|ad-container|ad-wrapper|ad-block|ad-unit|ads-container)\b/i,
            // 広告URLパターン
            adsSrc: /\/\/(.*\.)?(doubleclick|googlesyndication|googleadservices|amazon-adsystem|facebook\.com\/tr)/i,
            // スキップボタン
            skipButton: /skip[\s\-_]*ad/i,
            // 除外パターン（広告ではないもの）
            ignore: /\b(player|header|footer|nav|menu|content|main|search|input|form|button|textarea|select)\b/i
        };
        
        this.init();
    }
    
    async init() {
        try {
            // サイト別設定を読み込み
            await this.loadSiteSettings();
            
            if (this.isEnabled) {
                // 初回実行
                this.hideAds();
                
                // DOM変更の監視
                this.setupMutationObserver();
            }
            
            // メッセージリスナーを設定
            this.setupMessageListener();
            
            console.log('AdBlocker initialized:', this.isEnabled ? 'enabled' : 'disabled');
        } catch (error) {
            console.error('AdBlocker initialization failed:', error);
        }
    }
    
    async loadSiteSettings() {
        try {
            const result = await chrome.storage.local.get([this.currentDomain]);
            this.isEnabled = result[this.currentDomain] !== false; // デフォルトはtrue
        } catch (error) {
            console.warn('Failed to load site settings:', error);
            this.isEnabled = true; // フォールバック
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'toggleBlocking':
                    this.isEnabled = message.enabled;
                    if (this.isEnabled) {
                        this.startBlocking();
                    } else {
                        this.stopBlocking();
                    }
                    sendResponse({ success: true });
                    break;
                    
                case 'getStats':
                    sendResponse({
                        blockedCount: this.adBlockCount,
                        isEnabled: this.isEnabled
                    });
                    break;
                    
                case 'forceCheck':
                    if (this.isEnabled) {
                        this.hideAds();
                    }
                    sendResponse({ success: true });
                    break;
            }
        });
    }

    startBlocking() {
        if (!this.observer) {
            this.setupMutationObserver();
        }
        this.hideAds();
        console.log('AdBlocker started');
    }

    stopBlocking() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        console.log('AdBlocker stopped');
    }

    setupMutationObserver() {
        if (!this.isEnabled) return;
        
        this.observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            // 新しく追加された要素のみをチェック
            const addedNodes = [];
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        addedNodes.push(node);
                    }
                });
            });
            
            if (addedNodes.length > 0) {
                this.scheduleAdCheck(addedNodes);
            }
        });
        
        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
    
    scheduleAdCheck(elements = null) {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
        
        const delayTime = Math.max(300 - (Date.now() - this.lastExecTime), 0);
        
        this.timeoutId = setTimeout(() => {
            this.lastExecTime = Date.now();
            if (elements) {
                this.checkElements(elements);
            } else {
                this.hideAds();
            }
        }, delayTime);
    }
    
    checkElements(elements) {
        elements.forEach(element => {
            this.checkSingleElement(element);
            // 子要素もチェック
            element.querySelectorAll('*').forEach(child => {
                this.checkSingleElement(child);
            });
        });
    }
    
    checkSingleElement(elem) {
        try {
            // 既に処理済みの要素はスキップ
            if (this.processedElements.has(elem)) return;
            
            if (this.isAd(elem)) {
                this.hideElement(elem);
            }
            
            this.processedElements.add(elem);
        } catch (error) {
            console.warn('Error checking element:', error);
        }
    }
    
    hideAds() {
        if (!this.isEnabled) return;
        
        try {
            // より効率的な要素選択
            const selectors = [
                'iframe[src*="doubleclick"]',
                'iframe[src*="googlesyndication"]',
                '[class*="ad-"], [class*="ads-"]',
                '[id*="ad-"], [id*="ads-"]',
                'ins.adsbygoogle',
                '[data-ad-client]',
                '[data-ad-slot]'
            ];
            
            selectors.forEach(selector => {
                try {
                    document.querySelectorAll(selector).forEach(elem => {
                        if (!this.processedElements.has(elem) && this.isAd(elem)) {
                            this.hideElement(elem);
                        }
                    });
                } catch (e) {
                    // セレクターエラーは無視
                }
            });
            
            // 全要素チェックは最小限に
            this.checkNewElements();
            
        } catch (error) {
            console.error('Error in hideAds:', error);
        }
    }
    
    checkNewElements() {
        // 処理されていない新しい要素のみをチェック
        const allElements = document.querySelectorAll('*');
        let checkedCount = 0;
        const maxCheck = 100; // パフォーマンス制限
        
        for (const elem of allElements) {
            if (checkedCount >= maxCheck) break;
            
            if (!this.processedElements.has(elem)) {
                this.checkSingleElement(elem);
                checkedCount++;
            }
        }
    }
    
    isAd(elem) {
        if (!elem || !elem.tagName) return false;
        
        const tagName = elem.tagName.toLowerCase();
        
        // 基本タグは除外
        if (['html', 'body', 'head', 'script', 'style', 'meta', 'title'].includes(tagName)) {
            return false;
        }
        
        // スキップボタンの処理
        if (tagName === 'button' && this.handleSkipButton(elem)) {
            return false;
        }
        
        // 除外パターンチェック
        if (this.shouldIgnore(elem)) {
            return false;
        }
        
        // 広告パターンチェック
        return this.matchesAdPattern(elem);
    }
    
    handleSkipButton(elem) {
        const text = (elem.textContent || '').toLowerCase();
        const className = elem.className || '';
        const id = elem.id || '';
        
        if (this.patterns.skipButton.test(text) || 
            this.patterns.skipButton.test(className) || 
            this.patterns.skipButton.test(id)) {
            
            try {
                elem.click();
                console.log('AdBlock(Skip):', elem);
                return true;
            } catch (e) {
                console.warn('Failed to click skip button:', e);
            }
        }
        return false;
    }
    
    shouldIgnore(elem) {
        const id = elem.id || '';
        const className = elem.className || '';
        const role = elem.getAttribute('role') || '';
        
        return this.patterns.ignore.test(id) || 
               this.patterns.ignore.test(className) ||
               role === 'main' || 
               role === 'navigation';
    }
    
    matchesAdPattern(elem) {
        // iframe特有のチェック
        if (elem.tagName.toLowerCase() === 'iframe') {
            if (this.isAdIframe(elem)) return true;
        }
        
        // ins要素のチェック
        if (elem.tagName.toLowerCase() === 'ins') {
            const style = window.getComputedStyle(elem);
            if (style.position === 'fixed' || elem.className.includes('adsbygoogle')) {
                return true;
            }
        }
        
        // スポンサーリンク
        if (elem.getAttribute('rel') === 'sponsored') {
            return true;
        }
        
        // src属性チェック
        if (elem.src && this.patterns.adsSrc.test(elem.src)) {
            return true;
        }
        
        // 属性チェック
        if (this.hasAdAttributes(elem)) {
            return true;
        }
        
        // クラス名・IDチェック
        return this.hasAdIdentifiers(elem);
    }
    
    isAdIframe(elem) {
        const allow = elem.getAttribute('allow') || '';
        const loading = elem.getAttribute('loading') || '';
        const scrolling = elem.getAttribute('scrolling') || '';
        const role = elem.getAttribute('role') || '';
        
        // autoplay許可かつlazy loading以外
        if (allow.includes('autoplay') && !loading.includes('lazy')) {
            return true;
        }
        
        // スクロール無効かつpresentation以外
        if (scrolling === 'no' && role !== 'presentation') {
            return true;
        }
        
        return false;
    }
    
    hasAdAttributes(elem) {
        try {
            for (const attr of elem.attributes) {
                if (this.patterns.ads.test(attr.name) || 
                    this.patterns.ads.test(attr.value)) {
                    return true;
                }
            }
        } catch (e) {
            // 属性アクセスエラーは無視
        }
        return false;
    }
    
    hasAdIdentifiers(elem) {
        const id = elem.id || '';
        const className = elem.className || '';
        const title = elem.getAttribute('title') || '';
        const name = elem.getAttribute('name') || '';
        
        return this.patterns.ads.test(id) ||
               this.patterns.ads.test(className) ||
               this.patterns.ads.test(title) ||
               this.patterns.ads.test(name);
    }
    
    hideElement(elem) {
        try {
            this.adBlockCount++;
            console.log(`AdBlock(${this.adBlockCount}):`, elem);
            
            // 複数の非表示方法を試行
            elem.style.display = 'none';
            elem.style.visibility = 'hidden';
            elem.style.opacity = '0';
            elem.style.height = '0';
            elem.style.width = '0';
            
            // 親要素も広告コンテナの場合は非表示
            this.checkParentContainer(elem);
            
        } catch (error) {
            console.warn('Failed to hide element:', error);
        }
    }
    
    checkParentContainer(elem) {
        const parent = elem.parentElement;
        if (!parent) return;
        
        // 親要素が明らかに広告コンテナの場合
        const parentClass = parent.className || '';
        const parentId = parent.id || '';
        
        if (this.patterns.ads.test(parentClass) || this.patterns.ads.test(parentId)) {
            // 他に子要素がない、または全て広告要素の場合は親も非表示
            const siblings = Array.from(parent.children);
            const nonAdSiblings = siblings.filter(child => 
                !this.processedElements.has(child) || 
                child.style.display !== 'none'
            );
            
            if (nonAdSiblings.length <= 1) {
                parent.style.display = 'none';
                console.log(`AdBlock(Parent):`, parent);
            }
        }
    }
    
    // 統計情報取得
    getStats() {
        return {
            blockedCount: this.adBlockCount,
            processedElements: this.processedElements
        };
    }
    
    // 手動でチェック実行
    forceCheck() {
        this.hideAds();
    }
}

// グローバルに1つだけインスタンスを作成
if (!window.adBlockerInstance) {
    window.adBlockerInstance = new AdBlocker();
}

// 使用例：
// window.adBlockerInstance.getStats() // 統計確認
// window.adBlockerInstance.forceCheck() // 手動チェック