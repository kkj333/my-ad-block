**Chrome拡張機能用の広告ブロッカー**です。動作を分かりやすく解説します。

## 全体の流れ

```
1. 初期化 → 2. 広告検出 → 3. 広告非表示 → 4. 監視継続
```

## 主要な機能

### 1. 初期化（constructor & init）
```javascript
// AdBlockerクラスを作成して開始
constructor() {
    this.adBlockCount = 0;     // ブロックした広告の数
    this.patterns = {...};     // 広告を見つけるパターン
}
```

**やっていること**：
- 広告を見つけるためのルール（正規表現）を設定
- カウンターと管理用変数を初期化

### 2. 広告の検出パターン

```javascript
this.patterns = {
    // 「ad」「ads」「banner」などの単語を含む要素
    ads: /\b(ad|ads|banner|popup|sponsor)\b/i,
    
    // GoogleやAmazonの広告サーバー
    adsSrc: /doubleclick|googlesyndication|amazon-adsystem/i,
    
    // 「広告をスキップ」ボタン
    skipButton: /skip[\s\-_]*ad/i
};
```

**検出する広告の種類**：
- バナー広告（クラス名に「ad」「banner」等）
- iframe内の動画広告
- Google AdSense
- スキップボタン付き広告

### 3. ページ監視（setupMutationObserver）

```javascript
// ページの変更を常に監視
const observer = new MutationObserver((mutations) => {
    // 新しく追加された要素をチェック
    const addedNodes = []; // 新要素を収集
    // → 広告かどうか判定 → 広告なら非表示
});
```

**やっていること**：
- ページに新しい要素が追加されるたびに自動チェック
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

### YouTube閲覧時
```
1. ページ読み込み開始
2. 動画プレイヤー要素を検出 → 除外（重要コンテンツ）
3. 広告iframe要素を検出 → ブロック！
4. スキップボタン出現 → 自動クリック！
5. コンソールに「AdBlock(1): <element>」表示
```

### ニュースサイト閲覧時
```
1. 記事コンテンツ → 除外（main要素）
2. サイドバー広告 → class="ad-banner" → ブロック！
3. Google AdSense → iframe検出 → ブロック！
4. スポンサード記事 → rel="sponsored" → ブロック！
```

## まとめ

このコードは**賢い広告ブロッカー**で：

- ✅ **様々な広告形式に対応**（バナー、動画、テキスト）
- ✅ **誤ブロック防止**（重要コンテンツは保護）
- ✅ **高性能**（重複チェック回避、処理制限）
- ✅ **自動化**（スキップボタン自動クリック）
- ✅ **リアルタイム**（動的広告も瞬時ブロック）

Webページを開くと自動で広告を見つけて消してくれる、とても実用的なツールです！