# AdBlockerの仕組み（v2.0 - サイト別制御対応版）

**サイト別制御機能付きChrome拡張機能用の広告ブロッカー**です。動作を分かりやすく解説します。

## 全体の流れ

```
1. 初期化 → 2. サイト設定読み込み → 3. 広告検出 → 4. 広告非表示 → 5. 監視継続
                     ↓
              6. UI制御 ← ユーザー操作
```

## 主要な機能

### 1. 初期化（constructor & init）
```javascript
// AdBlockerクラスを作成して開始
constructor() {
    this.adBlockCount = 0;           // ブロックした広告の数
    this.isEnabled = true;           // ブロック有効/無効状態
    this.currentDomain = window.location.hostname; // 現在のドメイン
    this.patterns = {...};           // 広告を見つけるパターン
}

async init() {
    await this.loadSiteSettings();   // サイト別設定を読み込み
    if (this.isEnabled) {
        this.hideAds();              // 有効時のみ広告ブロック開始
        this.setupMutationObserver();
    }
    this.setupMessageListener();     // ポップアップとの通信設定
}
```

**やっていること**：
- 広告を見つけるためのルール（正規表現）を設定
- サイト別設定をChrome Storageから読み込み
- 有効時のみ広告ブロック機能を開始
- ポップアップUIとの通信を設定

### 2. 広告の検出パターン（改良版）

```javascript
this.patterns = {
    // より具体的な広告識別子（誤検出を防止）
    ads: /\b(adsby|adsense|adserver|adspace|advert|advertisement|banner|popup|sponsor|ad-container|ad-wrapper|ad-block|ad-unit|ads-container)\b/i,
    
    // GoogleやAmazonの広告サーバー
    adsSrc: /\/\/(.*\.)?(doubleclick|googlesyndication|googleadservices|amazon-adsystem|facebook\.com\/tr)/i,
    
    // 「広告をスキップ」ボタン
    skipButton: /skip[\s\-_]*ad/i,
    
    // 除外パターン（重要なUI要素を保護）
    ignore: /\b(player|header|footer|nav|menu|content|main|search|input|form|button|textarea|select)\b/i
};
```

**改良ポイント**：
- 汎用的すぎる「ad」「ads」を削除してGmail検索フォーム等の誤検出を防止
- より具体的な広告識別子を追加
- 検索フォーム等の重要UI要素を保護する除外パターンを強化

**検出する広告の種類**：
- バナー広告（具体的なクラス名パターン）
- iframe内の動画広告
- Google AdSense
- スキップボタン付き広告
- スポンサードコンテンツ

### 3. サイト別設定システム

```javascript
// Chrome Storage APIを使用した設定管理
async loadSiteSettings() {
    const result = await chrome.storage.local.get([this.currentDomain]);
    this.isEnabled = result[this.currentDomain] !== false; // デフォルトはtrue
}

// ポップアップUIとの通信
setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
            case 'toggleBlocking':
                this.isEnabled = message.enabled;
                // ブロック開始/停止を切り替え
                break;
            case 'getStats':
                sendResponse({ blockedCount: this.adBlockCount });
                break;
        }
    });
}
```

**やっていること**：
- ドメインごとの設定をローカルストレージに永続化
- ポップアップUIからのリアルタイム制御に対応
- 統計情報をUIに提供

### 4. ページ監視（setupMutationObserver）

```javascript
// ページの変更を常に監視（有効時のみ）
setupMutationObserver() {
    if (!this.isEnabled) return; // 無効時は監視しない
    
    this.observer = new MutationObserver((mutations) => {
        if (!this.isEnabled) return; // 途中で無効になった場合も停止
        
        // 新しく追加された要素をチェック
        const addedNodes = []; // 新要素を収集
        // → 広告かどうか判定 → 広告なら非表示
    });
}
```

**やっていること**：
- 有効時のみページ監視を実行（パフォーマンス向上）
- 設定変更時に動的に監視を開始/停止
- 動的に読み込まれる広告も瞬時にブロック

### 4. 広告判定ロジック（isAd）

```javascript
isAd(elem) {
    // 1. 基本タグ（html, body等）は除外
    if (['html', 'body', 'head'].includes(tagName)) return false;
    
    // 2. スキップボタンなら自動クリック
    if (tagName === 'button' && this.handleSkipButton(elem)) return false;
    
    // 3. 重要なコンテンツ（ナビ、メイン等）は除外
    if (this.shouldIgnore(elem)) return false;
    
    // 4. 広告パターンにマッチするかチェック
    return this.matchesAdPattern(elem);
}
```

**判定の流れ**：
```
要素発見 → 除外チェック → 広告パターンチェック → 結果
```

### 5. 広告の種類別チェック

#### iframe広告
```javascript
// YouTube動画広告など
if (allow.includes('autoplay') && !loading.includes('lazy')) {
    return true; // 広告と判定
}
```

#### バナー広告
```javascript
// クラス名やIDに「ad」が含まれる
if (this.patterns.ads.test(className)) {
    return true; // 広告と判定
}
```

#### スポンサーリンク
```javascript
if (elem.getAttribute('rel') === 'sponsored') {
    return true; // 広告と判定
}
```

### 6. 広告の非表示処理（hideElement）

```javascript
hideElement(elem) {
    // 複数の方法で確実に非表示
    elem.style.display = 'none';        // 表示しない
    elem.style.visibility = 'hidden';   // 見えなくする
    elem.style.opacity = '0';           // 透明にする
    elem.style.height = '0';            // 高さを0に
    elem.style.width = '0';             // 幅を0に
    
    console.log(`AdBlock(${this.adBlockCount}):`, elem);
}
```

**非表示の手法**：
- 複数のCSSプロパティで確実に消去
- 親要素も広告コンテナなら一緒に非表示

### 7. パフォーマンス最適化

```javascript
// 処理済み要素は再チェックしない
if (this.processedElements.has(elem)) return;

// 一度に大量チェックしない
const maxCheck = 100; // 制限
```

**最適化ポイント**：
- 同じ要素を何度もチェックしない
- 処理量を制限してブラウザを重くしない

## 実際の動作例

### Gmail使用時（改良後）
```
1. ページ読み込み開始
2. サイト設定読み込み → gmail.com: enabled=true
3. 検索フォーム要素 → 除外パターンマッチ → 保護！
4. サイドバー広告 → 広告パターンマッチ → ブロック！
5. 検索機能は正常に動作
```

### YouTube閲覧時
```
1. サイト設定確認 → youtube.com: enabled=true
2. 動画プレイヤー要素を検出 → 除外（重要コンテンツ）
3. 広告iframe要素を検出 → ブロック！
4. スキップボタン出現 → 自動クリック！
5. ポップアップでブロック数表示: "ブロック数: 1"
```

### サイト別制御の使用例
```
1. 拡張機能アイコンをクリック
2. ポップアップ表示: "現在のサイト: example.com"
3. トグルスイッチOFF → ブロック停止
4. 設定がChrome Storageに保存
5. 次回訪問時も設定が維持される
```

## まとめ

このコードは**サイト別制御機能付きの賢い広告ブロッカー**で：

### v2.0の新機能
- ✅ **サイト別制御**（ドメインごとにON/OFF切り替え）
- ✅ **直感的なUI**（ポップアップで簡単操作）
- ✅ **設定永続化**（Chrome Storage APIで自動保存）
- ✅ **リアルタイム統計**（ブロック数の表示）

### 従来からの機能
- ✅ **様々な広告形式に対応**（バナー、動画、テキスト）
- ✅ **誤ブロック防止強化**（Gmail検索フォーム等を保護）
- ✅ **高性能**（重複チェック回避、処理制限）
- ✅ **自動化**（スキップボタン自動クリック）
- ✅ **リアルタイム**（動的広告も瞬時ブロック）

### アーキテクチャの改良点
- **条件分岐最適化**: 無効時は処理を完全停止
- **通信システム**: PopupとContent Scriptの効率的な連携
- **パターン改良**: より精密な広告検出と誤検出防止

ユーザーが必要なサイトでは広告ブロックを無効にでき、重要なコンテンツを保護しながら効果的に広告をブロックする、非常に実用的なツールです！