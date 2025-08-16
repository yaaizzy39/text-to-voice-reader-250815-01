class TextToVoiceContent {
    constructor() {
        this.selectedText = '';
        this.isPlaying = false;
        this.currentAudio = null;
        this.currentAudioSource = null; // Web Audio APIのソースノード
        this.currentAudioContext = null; // Web Audio APIのコンテキスト
        this.lastAudioData = null; // 最後に生成した音声データを保存
        this.textBlocks = []; // 分割されたテキストブロック
        this.currentBlockIndex = 0; // 現在再生中のブロックインデックス
        this.isPlayingSequence = false; // 順次再生中フラグ
        this.audioBlocks = []; // 各ブロックの音声データ
        this.isSelecting = false; // テキスト選択中フラグ
        this.settings = {
            speed: 1.0,
            volume: 1.0,
            quality: 'medium',
            modelId: 'a59cb814-0083-4369-8542-f51a29e72af7' // デフォルト（女性）
        };
        
        this.init();
        
        // 定期的にテキスト選択をチェック
        this.startSelectionPolling();
    }

    init() {
        this.loadSettings();
        this.createUI();
        this.attachEventListeners();
        this.setupContextMenu();
        this.setupMessageListener();
    }
    
    // 定期的なテキスト選択監視（SPAやイベント制御が厳しいサイト用）
    startSelectionPolling() {
        let lastSelectedText = '';
        
        const checkSelection = () => {
            // 選択中はチェックしない
            if (this.isSelecting) {
                return;
            }
            
            const currentText = window.getSelection().toString().trim();
            
            if (currentText !== lastSelectedText) {
                lastSelectedText = currentText;
                this.handleTextSelection(null);
            }
        };
        
        // 500msごとにチェック
        setInterval(checkSelection, 500);
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['ttsSettings']);
            if (result.ttsSettings) {
                this.settings = { ...this.settings, ...result.ttsSettings };
            }
        } catch (error) {
            // 設定読み込み失敗時は既定値を使用
        }
    }

    // background scriptからの設定変更通知を受信
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'settingsChanged') {
                console.log('設定変更を受信:', message.settings);
                this.settings = { ...this.settings, ...message.settings };
                console.log('設定を更新しました:', this.settings);
                
                // 応答を送信
                sendResponse({ success: true });
            }
        });
    }

    createUI() {
        console.log('createUI が呼び出されました');
        
        try {
            this.injectStyles();
            this.createButton();
        } catch (error) {
            console.error('UI作成でエラーが発生:', error);
            // フォールバック: 簡単な方法で再試行
            setTimeout(() => {
                try {
                    this.createSimpleButton();
                } catch (e) {
                    console.error('フォールバック失敗:', e);
                }
            }, 500);
        }
    }
    
    injectStyles() {
        // スタイルが既に注入されている場合はスキップ
        if (document.getElementById('tts-reader-styles')) {
            return;
        }
        
        // 読み上げボタンのスタイルを注入
        const style = document.createElement('style');
        style.id = 'tts-reader-styles';
        style.textContent = `
            .tts-button-container {
                position: fixed !important;
                display: none !important;
                flex-direction: row !important;
                gap: 8px !important;
                z-index: 999999 !important;
                pointer-events: auto !important;
            }
            
            .tts-button {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                color: white !important;
                border: none !important;
                border-radius: 25px !important;
                padding: 12px 16px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4) !important;
                transition: all 0.3s ease !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                backdrop-filter: blur(10px) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
                min-width: 80px !important;
                white-space: nowrap !important;
                pointer-events: auto !important;
            }
            
            .tts-download-btn {
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%) !important;
            }
            
            .tts-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
                background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
            }
            
            .tts-button:active {
                transform: translateY(0px);
            }
            
            .tts-button.playing {
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4); }
                50% { box-shadow: 0 6px 25px rgba(255, 107, 107, 0.8); }
                100% { box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4); }
            }
            
            .tts-icon {
                font-size: 16px;
            }
        `;
        
        // headまたはdocumentElementにスタイルを追加
        const targetElement = document.head || document.documentElement;
        if (targetElement) {
            targetElement.appendChild(style);
            console.log('スタイルを追加しました');
        } else {
            console.warn('スタイル追加先が見つかりません');
        }
    }
    
    createButton() {
        // 既にボタンが存在する場合はスキップ
        if (this.button && document.contains(this.button)) {
            console.log('ボタンは既に存在します');
            return;
        }
        
        console.log('createButton が呼び出されました');
        
        // 読み上げボタンを作成
        this.button = document.createElement('div');
        this.button.className = 'tts-button-container';
        this.button.innerHTML = `
            <button class="tts-button tts-play-btn">
                <span class="tts-icon">🔊</span>
                <span class="tts-text">読み上げ</span>
            </button>
            <button class="tts-button tts-download-btn">
                <span class="tts-icon">📥</span>
                <span class="tts-text">DL</span>
            </button>
        `;
        this.button.id = 'tts-reader-button-' + Date.now(); // ユニークID
        
        // 個別のボタン要素を取得
        this.playButton = this.button.querySelector('.tts-play-btn');
        this.downloadButton = this.button.querySelector('.tts-download-btn');
        
        this.applyButtonStyles();
        this.attachButtonToDOM();
    }
    
    applyButtonStyles() {
        // 初期状態では非表示
        this.button.style.cssText = `
            position: fixed !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
            padding: 12px 20px !important;
            border: none !important;
            border-radius: 25px !important;
            z-index: 2147483647 !important;
            display: none !important;
            visibility: hidden !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4) !important;
            min-width: 120px !important;
            white-space: nowrap !important;
            align-items: center !important;
            gap: 8px !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
            user-select: none !important;
            pointer-events: auto !important;
        `;
    }
    
    attachButtonToDOM() {
        let targetElement = document.body;
        
        // bodyが存在しない場合の代替手段
        if (!targetElement) {
            targetElement = document.documentElement;
        }
        
        if (!targetElement) {
            console.error('ボタンを追加する要素が見つかりません');
            return;
        }
        
        try {
            targetElement.appendChild(this.button);
            console.log('読み上げボタンを作成しました:', {
                element: this.button,
                parent: this.button.parentNode,
                targetElement: targetElement.tagName,
                inDOM: document.contains(this.button)
            });
        } catch (error) {
            console.error('ボタンのDOM追加でエラー:', error);
        }
    }
    
    // フォールバック用のシンプルなボタン作成
    createSimpleButton() {
        if (this.button && document.contains(this.button)) {
            return;
        }
        
        console.log('シンプルボタンを作成します');
        
        this.button = document.createElement('div');
        this.button.textContent = '🔊 読み上げ';
        this.button.style.cssText = `
            position: fixed !important;
            left: 10px !important;
            top: 10px !important;
            background: #667eea !important;
            color: white !important;
            padding: 10px 15px !important;
            border-radius: 5px !important;
            z-index: 2147483647 !important;
            display: none !important;
            cursor: pointer !important;
            font-size: 14px !important;
            font-family: Arial, sans-serif !important;
        `;
        
        (document.body || document.documentElement).appendChild(this.button);
    }

    attachEventListeners() {
        // マウスダウンで選択開始を検知
        document.addEventListener('mousedown', (e) => {
            this.isSelecting = true;
            this.hideButton(); // 選択中はボタンを非表示
        });
        
        // マウスアップで選択終了を検知（ボタン表示のメインタイミング）
        document.addEventListener('mouseup', (e) => {
            if (this.isSelecting) {
                this.isSelecting = false;
                // 少し遅延させてテキスト選択状態をチェック
                setTimeout(() => {
                    this.handleTextSelection(e);
                }, 100);
            }
        });
        
        // キーボードでの選択変更を検知
        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
                e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                e.key === 'Shift' || e.ctrlKey || e.metaKey) {
                // キーボード選択の場合は即座チェック
                setTimeout(() => {
                    this.handleTextSelection(e);
                }, 50);
            }
        });

        // 読み上げボタンクリック
        this.playButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleButtonClick();
        });

        // ダウンロードボタンクリック
        this.downloadButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.downloadAudio();
        });

        // クリック時にボタンを非表示（少し遅延させる）
        document.addEventListener('click', (e) => {
            // テキスト選択直後のクリックを無視する
            setTimeout(() => {
                // 再生中または順次再生中は非表示にしない
                if (this.isPlaying || this.isPlayingSequence) {
                    return;
                }
                
                if (!e.target.closest('.tts-button-container') && !window.getSelection().toString().trim()) {
                    this.hideButton();
                }
            }, 100);
        });

        // スクロール時にボタンを非表示（再生中は除く）
        document.addEventListener('scroll', () => {
            // 再生中または順次再生中は非表示にしない
            if (this.isPlaying || this.isPlayingSequence) {
                return;
            }
            
            if (this.button.style.display === 'flex') {
                this.hideButton();
            }
        });
    }

    setupContextMenu() {
        // 右クリックメニューからも実行可能にする
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'playSelectedText') {
                const text = window.getSelection().toString().trim();
                if (text) {
                    this.playText(text);
                }
                sendResponse({ success: true });
            }
        });
    }

    handleTextSelection(e) {
        // 複数の方法でテキスト選択を検出
        let selectedText = '';
        
        try {
            // 1. window.getSelection()
            const selection = window.getSelection();
            selectedText = selection.toString().trim();
            
            // 2. document.getSelection() (フォールバック)
            if (!selectedText && document.getSelection) {
                selectedText = document.getSelection().toString().trim();
            }
            
            // 3. レンジベースの選択検出
            if (!selectedText && selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                selectedText = range.toString().trim();
            }
            
            
        } catch (error) {
            // テキスト選択検出エラー時は何もしない
        }
        
        if (selectedText && selectedText.length > 0) {
            this.selectedText = selectedText;
            this.showButton(e);
        } else {
            this.hideButton();
        }
    }

    showButton(e) {
        if (!this.button || !document.contains(this.button)) {
            return;
        }
        
        const selection = window.getSelection();
        
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            
            // 複数行選択時の処理：選択範囲の高さが30px超の場合は中央寄りに配置
            const isMultiLine = rect.height > 30;
            let x, y;
            
            if (isMultiLine) {
                // 複数行の場合：選択範囲の右側中央に配置
                x = rect.right + 10;
                y = rect.top + (rect.height / 2) - 25; // ボタン高さの半分程度上に
            } else {
                // 単一行の場合：従来通り右上に配置
                x = rect.right + 10;
                y = rect.top - 45;
            }
            
            // ボタンコンテナの実際の幅を取得（読み上げ + DLボタン）
            const buttonContainerWidth = 220; // 読み上げボタン(約100px) + DLボタン(約50px) + gap(8px) + margin
            
            // 画面内に収まるように位置を調整
            let adjustedX = x;
            let adjustedY = Math.max(10, y); // 最低10px上から
            
            // 右端に収まらない場合は左側に配置
            if (adjustedX + buttonContainerWidth > window.innerWidth - 10) {
                // 選択範囲の左側に配置を試行
                adjustedX = rect.left - buttonContainerWidth - 10;
                
                // 左側にも収まらない場合は、画面内に強制的に収める
                if (adjustedX < 10) {
                    adjustedX = window.innerWidth - buttonContainerWidth - 10;
                    // それでも収まらない場合は画面中央
                    if (adjustedX < 10) {
                        adjustedX = Math.max(10, (window.innerWidth - buttonContainerWidth) / 2);
                    }
                }
            }
            
            
            // ボタンを選択範囲の近くに表示
            this.button.style.setProperty('left', `${adjustedX}px`, 'important');
            this.button.style.setProperty('top', `${adjustedY}px`, 'important');
            this.button.style.setProperty('z-index', '2147483647', 'important');
            this.button.style.setProperty('display', 'flex', 'important');
            this.button.style.setProperty('position', 'fixed', 'important');
            this.button.style.setProperty('visibility', 'visible', 'important');
            this.button.style.setProperty('opacity', '1', 'important');
            
            
            // アニメーション効果を簡素化
            this.button.style.setProperty('opacity', '0', 'important');
            setTimeout(() => {
                if (this.button && document.contains(this.button)) {
                    this.button.style.setProperty('opacity', '1', 'important');
                }
            }, 50);
        }
    }

    hideButton() {
        this.button.style.setProperty('display', 'none', 'important');
        this.button.style.setProperty('visibility', 'hidden', 'important');
        this.selectedText = '';
    }

    async downloadAudio() {
        // 現在選択されているテキストを取得
        const currentText = window.getSelection().toString().trim() || this.selectedText;
        
        if (!currentText) {
            this.showNotification('ダウンロードするテキストを選択してください', 'error');
            return;
        }

        // 選択されているテキストが前回と異なる場合、または音声データがない場合は新規生成
        const needNewGeneration = !this.lastAudioData || 
                                 !this.textBlocks || 
                                 this.textBlocks.join('') !== currentText;

        if (needNewGeneration) {
            // 新しいテキストで音声生成
            await this.generateAudioForDownload(currentText);
        }

        // 長文の場合は全ブロック結合MP3を作成
        if (this.textBlocks && this.textBlocks.length > 1) {
            await this.downloadCombinedAudio();
            return;
        }

        // 単一ブロックの場合は従来通り
        if (!this.lastAudioData) {
            this.showNotification('音声の生成に失敗しました', 'error');
            return;
        }

        try {
            // Base64をBlobに変換
            const base64String = this.lastAudioData.base64Data;
            const binaryString = atob(base64String);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const blob = new Blob([bytes], { type: this.lastAudioData.mimeType || 'audio/mpeg' });
            
            // ファイル名を生成（テキストの最初の20文字 + タイムスタンプ）
            const textForFilename = this.lastAudioData.text.substring(0, 20).replace(/[^\w\s-]/g, '');
            const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
            const filename = `tts_${textForFilename}_${timestamp}.mp3`;
            
            // ダウンロードリンクを作成
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            // ダウンロードを実行
            document.body.appendChild(a);
            a.click();
            
            // クリーンアップ
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification(`音声ファイルをダウンロードしました: ${filename}`, 'success');
            
        } catch (error) {
            console.error('音声ダウンロードエラー:', error);
            this.showNotification('音声ダウンロードに失敗しました', 'error');
        }
    }

    // ダウンロード専用の音声生成
    async generateAudioForDownload(text) {
        try {
            this.showProgressModal('音声を生成中...', 0, 1);
            
            // テキストを分割
            this.textBlocks = this.splitTextIntoBlocks(text, 1000);
            this.audioBlocks = []; // リセット
            
            if (this.textBlocks.length === 1) {
                // 単一ブロックの場合
                this.updateProgressModal('音声を生成中...', 0, 1);
                
                const response = await chrome.runtime.sendMessage({
                    action: 'generateSpeech',
                    text: this.textBlocks[0],
                    settings: this.settings
                });
                
                if (response.success && response.audioData) {
                    this.lastAudioData = {
                        base64Data: response.audioData.base64Data,
                        mimeType: response.audioData.mimeType,
                        text: this.textBlocks[0],
                        timestamp: new Date().toISOString()
                    };
                    this.audioBlocks[0] = response.audioData;
                } else {
                    throw new Error(response.error || '音声生成に失敗しました');
                }
            } else {
                // 複数ブロックの場合
                this.updateProgressModal(`全${this.textBlocks.length}ブロックの音声を生成中...`, 0, this.textBlocks.length);
                
                for (let i = 0; i < this.textBlocks.length; i++) {
                    this.updateProgressModal(`ブロック ${i + 1}/${this.textBlocks.length} を音声合成中...`, i, this.textBlocks.length);
                    
                    const response = await chrome.runtime.sendMessage({
                        action: 'generateSpeech',
                        text: this.textBlocks[i],
                        settings: this.settings
                    });
                    
                    if (response.success && response.audioData) {
                        this.audioBlocks[i] = response.audioData;
                    } else {
                        throw new Error(`ブロック${i + 1}の音声生成に失敗: ${response.error}`);
                    }
                }
            }
            
            this.hideProgressModal();
            
        } catch (error) {
            this.hideProgressModal();
            console.error('ダウンロード用音声生成エラー:', error);
            throw error;
        }
    }

    // 全ブロック結合MP3ダウンロード
    async downloadCombinedAudio() {
        try {
            // 音声ブロックが既に生成されている前提で処理
            
            this.updateProgressModal('音声ファイルを結合中...', this.textBlocks.length, this.textBlocks.length);
            
            // 全ブロックのArrayBufferを結合
            const result = await this.combineAudioBlocks();
            
            // 結合結果の形式を判定
            const isWav = result.isWav || false;
            const mimeType = isWav ? 'audio/wav' : 'audio/mpeg';
            const extension = isWav ? 'wav' : 'mp3';
            
            // 結合したArrayBufferをBlobに変換
            const blob = new Blob([result.buffer || result], { type: mimeType });
            
            // ファイル名を生成
            const fullText = this.textBlocks.join(' ');
            const textForFilename = fullText.substring(0, 30).replace(/[^\w\s-]/g, '');
            const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
            const filename = `tts_combined_${textForFilename}_${timestamp}.${extension}`;
            
            // ダウンロード実行
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            document.body.appendChild(a);
            a.click();
            
            // クリーンアップ
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.hideProgressModal();
            this.showNotification(`結合音声ファイルをダウンロードしました: ${filename}`, 'success');
            
        } catch (error) {
            this.hideProgressModal();
            console.error('結合音声ダウンロードエラー:', error);
            this.showNotification(`結合音声ダウンロードに失敗: ${error.message}`, 'error');
        }
    }

    // 音声ブロックを結合（MP3バイナリ結合）
    async combineAudioBlocks() {
        try {
            // 簡易MP3結合：各MP3ファイルのバイナリデータを結合
            // 注意：これは完璧なMP3結合ではありませんが、多くの場合に動作します
            const mp3Chunks = [];
            let totalSize = 0;
            
            for (let i = 0; i < this.audioBlocks.length; i++) {
                if (this.audioBlocks[i] && this.audioBlocks[i].base64Data) {
                    const base64String = this.audioBlocks[i].base64Data;
                    const binaryString = atob(base64String);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let j = 0; j < binaryString.length; j++) {
                        bytes[j] = binaryString.charCodeAt(j);
                    }
                    
                    // MP3ヘッダーをスキップして音声データ部分のみを結合
                    // （完全な実装ではありませんが、基本的な結合として機能）
                    mp3Chunks.push(bytes);
                    totalSize += bytes.length;
                }
            }
            
            if (mp3Chunks.length === 0) {
                throw new Error('有効な音声ブロックがありません');
            }
            
            // 全MP3チャンクを結合
            const combinedArray = new Uint8Array(totalSize);
            let offset = 0;
            
            for (const chunk of mp3Chunks) {
                combinedArray.set(chunk, offset);
                offset += chunk.length;
            }
            
            return combinedArray.buffer;
            
        } catch (error) {
            console.error('音声ブロック結合エラー:', error);
            
            // フォールバック：Web Audio APIを使用したWAV結合
            console.log('MP3結合に失敗、WAV結合にフォールバック');
            const wavBuffer = await this.combineAudioBlocksAsWav();
            return { buffer: wavBuffer, isWav: true };
        }
    }

    // フォールバック：WAV結合
    async combineAudioBlocksAsWav() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffers = [];
        let totalDuration = 0;
        let sampleRate = 44100;
        
        // 各ブロックをAudioBufferに変換
        for (let i = 0; i < this.audioBlocks.length; i++) {
            if (this.audioBlocks[i] && this.audioBlocks[i].base64Data) {
                const base64String = this.audioBlocks[i].base64Data;
                const binaryString = atob(base64String);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) {
                    bytes[j] = binaryString.charCodeAt(j);
                }
                const arrayBuffer = bytes.buffer;
                
                try {
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice());
                    audioBuffers.push(audioBuffer);
                    totalDuration += audioBuffer.duration;
                    sampleRate = audioBuffer.sampleRate;
                } catch (decodeError) {
                    console.warn(`ブロック${i + 1}のデコードに失敗、スキップします:`, decodeError);
                }
            }
        }
        
        if (audioBuffers.length === 0) {
            throw new Error('有効な音声ブロックがありません');
        }
        
        // 結合用のAudioBufferを作成
        const numberOfChannels = audioBuffers[0].numberOfChannels;
        const combinedBuffer = audioContext.createBuffer(
            numberOfChannels,
            Math.floor(totalDuration * sampleRate),
            sampleRate
        );
        
        // 各チャンネルの音声データを結合
        let currentOffset = 0;
        for (const audioBuffer of audioBuffers) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sourceData = audioBuffer.getChannelData(channel);
                const targetData = combinedBuffer.getChannelData(channel);
                
                for (let i = 0; i < sourceData.length; i++) {
                    if (currentOffset + i < targetData.length) {
                        targetData[currentOffset + i] = sourceData[i];
                    }
                }
            }
            currentOffset += audioBuffer.length;
        }
        
        audioContext.close();
        return this.audioBufferToWav(combinedBuffer);
    }

    // AudioBufferをWAVファイルのArrayBufferに変換
    audioBufferToWav(audioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length * numberOfChannels * 2; // 16bit
        
        const buffer = new ArrayBuffer(44 + length);
        const view = new DataView(buffer);
        
        // WAVヘッダーを書き込み
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);
        
        // 音声データを書き込み
        let offset = 44;
        for (let i = 0; i < audioBuffer.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample * 0x7FFF, true);
                offset += 2;
            }
        }
        
        return buffer;
    }


    async handleButtonClick() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else if (this.selectedText) {
            await this.playText(this.selectedText);
        }
    }

    async playText(text) {
        if (!text || text.trim().length === 0) {
            this.showNotification('読み上げるテキストを選択してください', 'error');
            return;
        }

        // テキストを1000文字以内のブロックに分割
        this.textBlocks = this.splitTextIntoBlocks(text, 1000);
        this.currentBlockIndex = 0;
        this.isPlayingSequence = true;
        
        if (this.textBlocks.length > 1) {
            this.showNotification(`長文を${this.textBlocks.length}つのブロックに分割して順次再生します`, 'info');
        }

        // 最初のブロックから再生開始
        await this.playTextBlock(this.textBlocks[0], 0);
    }

    // テキストを1000文字以内のブロックに分割（改行を優先）
    splitTextIntoBlocks(text, maxLength) {
        if (text.length <= maxLength) {
            return [text];
        }

        const blocks = [];
        let remainingText = text;

        while (remainingText.length > 0) {
            if (remainingText.length <= maxLength) {
                blocks.push(remainingText);
                break;
            }

            // maxLength以内で最適な切断点を探す
            let cutPoint = maxLength;
            const searchText = remainingText.substring(0, maxLength);

            // 1. 改行を優先して探す
            const lastNewline = searchText.lastIndexOf('\n');
            if (lastNewline > maxLength * 0.5) { // 半分以上の位置にある改行を採用
                cutPoint = lastNewline;
            } else {
                // 2. 句読点を探す
                const punctuationMarks = ['。', '！', '？', '.', '!', '?'];
                let lastPunctuation = -1;
                for (const mark of punctuationMarks) {
                    const pos = searchText.lastIndexOf(mark);
                    if (pos > lastPunctuation && pos > maxLength * 0.3) {
                        lastPunctuation = pos + 1; // 句読点の後で切る
                    }
                }
                
                if (lastPunctuation > -1) {
                    cutPoint = lastPunctuation;
                } else {
                    // 3. 空白を探す
                    const lastSpace = Math.max(
                        searchText.lastIndexOf(' '),
                        searchText.lastIndexOf('　')
                    );
                    if (lastSpace > maxLength * 0.3) {
                        cutPoint = lastSpace;
                    }
                }
            }

            blocks.push(remainingText.substring(0, cutPoint).trim());
            remainingText = remainingText.substring(cutPoint).trim();
        }

        return blocks.filter(block => block.length > 0);
    }

    // 個別ブロックの再生
    async playTextBlock(text, blockIndex) {
        try {
            this.setPlayingState(true);
            
            // Background scriptに音声生成を依頼
            const response = await chrome.runtime.sendMessage({
                action: 'generateSpeech',
                text: text,
                settings: this.settings
            });

            if (response.success && response.audioData) {
                
                // 各ブロックの音声データを保存
                if (!this.audioBlocks[blockIndex]) {
                    this.audioBlocks[blockIndex] = response.audioData;
                }
                
                // 最後に再生されたブロックを保存（単体ダウンロード用）
                this.lastAudioData = {
                    base64Data: response.audioData.base64Data,
                    mimeType: response.audioData.mimeType,
                    text: text,
                    timestamp: new Date().toISOString()
                };
                
                // Base64からArrayBufferに変換
                const base64String = response.audioData.base64Data;
                const binaryString = atob(base64String);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const arrayBuffer = bytes.buffer;
                
                // ダウンロードボタンは常に表示
                
                // Web Audio APIで直接ArrayBufferから再生（CSP制限回避）
                await this.playAudioBufferWithSequence(arrayBuffer, blockIndex);
                
            } else {
                throw new Error(response.error || '音声生成に失敗しました');
            }

        } catch (error) {
            console.error('音声再生エラー:', error);
            this.showNotification(`ブロック${blockIndex + 1}の音声再生エラー: ${error.message}`, 'error');
            this.setPlayingState(false);
            this.isPlayingSequence = false;
        }
    }

    async playAudio(audioUrl) {
        return new Promise((resolve, reject) => {
            // Web Speech APIの特別なURLの場合
            if (audioUrl === 'web-speech-api://fallback') {
                this.showNotification('AIVIS音声が利用できないため、ブラウザ標準音声を使用しています', 'warning');
                resolve();
                return;
            }

            this.currentAudio = new Audio(audioUrl);
            this.currentAudio.volume = this.settings.volume;
            this.currentAudio.playbackRate = this.settings.speed;

            this.currentAudio.addEventListener('ended', () => {
                this.setPlayingState(false);
                if (audioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(audioUrl);
                }
                resolve();
            });

            this.currentAudio.addEventListener('error', (e) => {
                this.setPlayingState(false);
                if (audioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(audioUrl);
                }
                
                // フォールバック: ブラウザ標準のWeb Speech APIを使用
                this.playWithWebSpeechAPI(this.selectedText)
                    .then(() => resolve())
                    .catch(() => reject(new Error('音声の再生に失敗しました')));
            });

            // 音声再生開始
            this.currentAudio.play().catch((error) => {
                // フォールバック: ブラウザ標準のWeb Speech APIを使用
                this.playWithWebSpeechAPI(this.selectedText)
                    .then(() => resolve())
                    .catch(() => reject(error));
            });
        });
    }

    // Web Audio APIでArrayBufferから直接再生（CSP制限回避）
    async playAudioBuffer(arrayBuffer) {
        return new Promise(async (resolve, reject) => {
            try {
                // 既存の再生を停止
                this.stopCurrentWebAudio();
                
                // AudioContextを作成
                this.currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // ArrayBufferを音声データにデコード
                const audioBuffer = await this.currentAudioContext.decodeAudioData(arrayBuffer);
                
                // AudioBufferSourceNodeを作成
                this.currentAudioSource = this.currentAudioContext.createBufferSource();
                this.currentAudioSource.buffer = audioBuffer;
                
                // ボリューム調整
                const gainNode = this.currentAudioContext.createGain();
                gainNode.gain.value = this.settings.volume || 1.0;
                
                // 速度調整（ピッチも変わりますが、一旦元の動作に戻します）
                this.currentAudioSource.playbackRate.value = this.settings.speed || 1.0;
                
                // 接続: source → gainNode → destination
                this.currentAudioSource.connect(gainNode);
                gainNode.connect(this.currentAudioContext.destination);
                
                // 再生終了のイベントリスナー
                this.currentAudioSource.onended = () => {
                    this.setPlayingState(false);
                    this.showNotification('AIVIS音声の再生が完了しました', 'success');
                    this.cleanupWebAudio();
                    
                    // 再生完了後、テキスト選択がない場合はボタンを非表示
                    setTimeout(() => {
                        if (!window.getSelection().toString().trim()) {
                            this.hideButton();
                        }
                    }, 2000); // 2秒後に自動非表示
                    
                    resolve();
                };
                
                // エラーハンドリング
                this.currentAudioSource.onerror = (error) => {
                    this.setPlayingState(false);
                    this.cleanupWebAudio();
                    reject(new Error('Web Audio API再生エラー'));
                };
                
                // 再生開始
                this.setPlayingState(true);
                this.showNotification('AIVIS音声を再生中...', 'info');
                this.currentAudioSource.start(0);
                
            } catch (error) {
                this.setPlayingState(false);
                this.cleanupWebAudio();
                reject(error);
            }
        });
    }

    // 順次再生対応のWeb Audio API再生
    async playAudioBufferWithSequence(arrayBuffer, blockIndex) {
        return new Promise(async (resolve, reject) => {
            try {
                // 既存の再生を停止
                this.stopCurrentWebAudio();
                
                // AudioContextを作成
                this.currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // ArrayBufferを音声データにデコード
                const audioBuffer = await this.currentAudioContext.decodeAudioData(arrayBuffer);
                
                // AudioBufferSourceNodeを作成
                this.currentAudioSource = this.currentAudioContext.createBufferSource();
                this.currentAudioSource.buffer = audioBuffer;
                
                // ボリューム調整
                const gainNode = this.currentAudioContext.createGain();
                gainNode.gain.value = this.settings.volume || 1.0;
                
                // 速度調整
                this.currentAudioSource.playbackRate.value = this.settings.speed || 1.0;
                
                // 接続: source → gainNode → destination
                this.currentAudioSource.connect(gainNode);
                gainNode.connect(this.currentAudioContext.destination);
                
                // 再生終了のイベントリスナー（順次再生対応）
                this.currentAudioSource.onended = async () => {
                    this.cleanupWebAudio();
                    
                    // 次のブロックがあるかチェック
                    if (this.isPlayingSequence && blockIndex + 1 < this.textBlocks.length) {
                        this.currentBlockIndex = blockIndex + 1;
                        const nextBlock = this.textBlocks[this.currentBlockIndex];
                        this.showNotification(`ブロック${this.currentBlockIndex + 1}/${this.textBlocks.length}を再生中...`, 'info');
                        
                        // 次のブロックを再生
                        await this.playTextBlock(nextBlock, this.currentBlockIndex);
                    } else {
                        // 全て完了
                        this.setPlayingState(false);
                        this.isPlayingSequence = false;
                        const totalBlocks = this.textBlocks.length;
                        this.showNotification(totalBlocks > 1 ? `全${totalBlocks}ブロックの再生が完了しました` : 'AIVIS音声の再生が完了しました', 'success');
                        
                        // 再生完了後、テキスト選択がない場合はボタンを非表示
                        setTimeout(() => {
                            if (!window.getSelection().toString().trim()) {
                                this.hideButton();
                            }
                        }, 2000); // 2秒後に自動非表示
                    }
                    resolve();
                };
                
                // エラーハンドリング
                this.currentAudioSource.onerror = (error) => {
                    this.setPlayingState(false);
                    this.isPlayingSequence = false;
                    this.cleanupWebAudio();
                    reject(new Error('Web Audio API再生エラー'));
                };
                
                // 再生開始
                this.setPlayingState(true);
                const blockInfo = this.textBlocks.length > 1 ? ` (${blockIndex + 1}/${this.textBlocks.length})` : '';
                this.showNotification(`AIVIS音声を再生中${blockInfo}...`, 'info');
                this.currentAudioSource.start(0);
                
            } catch (error) {
                this.setPlayingState(false);
                this.isPlayingSequence = false;
                this.cleanupWebAudio();
                reject(error);
            }
        });
    }

    // Web Speech APIフォールバック
    async playWithWebSpeechAPI(text) {
        return new Promise((resolve, reject) => {
            if (!('speechSynthesis' in window)) {
                reject(new Error('Web Speech APIが利用できません'));
                return;
            }

            // 既存の発話を停止
            speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.settings.speed || 1.0;
            utterance.volume = this.settings.volume || 1.0;
            utterance.lang = 'ja-JP';

            // 日本語の音声を検索
            const voices = speechSynthesis.getVoices();
            const japaneseVoice = voices.find(voice => 
                voice.lang.includes('ja') || voice.name.includes('Japanese')
            );
            
            if (japaneseVoice) {
                utterance.voice = japaneseVoice;
            }

            utterance.onstart = () => {
                this.setPlayingState(true);
                this.showNotification('ブラウザ標準音声で再生中', 'info');
            };

            utterance.onend = () => {
                this.setPlayingState(false);
                resolve();
            };

            utterance.onerror = (event) => {
                this.setPlayingState(false);
                reject(new Error(`Web Speech APIエラー: ${event.error}`));
            };

            speechSynthesis.speak(utterance);
        });
    }

    stopPlayback() {
        // 順次再生を停止
        this.isPlayingSequence = false;
        
        // 通常の音声を停止
        if (this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }
        
        // Web Audio APIの音声を停止
        this.stopCurrentWebAudio();
        
        // Web Speech APIの音声も停止
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        // プログレスモーダルを非表示
        this.hideProgressModal();
        
        this.setPlayingState(false);
        this.showNotification('音声再生を停止しました', 'info');
        
        // 停止後、テキスト選択がない場合はボタンを非表示
        setTimeout(() => {
            if (!window.getSelection().toString().trim()) {
                this.hideButton();
            }
        }, 1000); // 1秒後に自動非表示
    }

    // Web Audio APIの再生を停止
    stopCurrentWebAudio() {
        if (this.currentAudioSource) {
            try {
                this.currentAudioSource.stop();
            } catch (error) {
                // 既に停止している場合はエラーを無視
            }
        }
        this.cleanupWebAudio();
    }

    // Web Audio APIのリソースをクリーンアップ
    cleanupWebAudio() {
        if (this.currentAudioContext && this.currentAudioContext.state !== 'closed') {
            this.currentAudioContext.close();
        }
        this.currentAudioSource = null;
        this.currentAudioContext = null;
    }

    setPlayingState(isPlaying) {
        this.isPlaying = isPlaying;
        
        if (isPlaying) {
            this.playButton.classList.add('playing');
            this.playButton.innerHTML = `
                <span class="tts-icon">⏸️</span>
                <span class="tts-text">停止</span>
            `;
        } else {
            this.playButton.classList.remove('playing');
            this.playButton.innerHTML = `
                <span class="tts-icon">🔊</span>
                <span class="tts-text">読み上げ</span>
            `;
        }
    }

    showNotification(message, type = 'info') {
        // 簡易通知システム
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ff4757' : type === 'warning' ? '#ffa502' : type === 'success' ? '#2ed573' : '#5352ed'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 999999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            max-width: 300px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // 3秒後に自動削除
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    // プログレス表示モーダル
    showProgressModal(message, current, total) {
        // 既存のモーダルを削除
        this.hideProgressModal();
        
        const modal = document.createElement('div');
        modal.id = 'tts-progress-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        `;
        
        const progressBox = document.createElement('div');
        progressBox.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            text-align: center;
        `;
        
        const progressText = document.createElement('div');
        progressText.id = 'tts-progress-text';
        progressText.style.cssText = `
            font-size: 16px;
            font-weight: 500;
            color: #333;
            margin-bottom: 20px;
        `;
        progressText.textContent = message;
        
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            width: 100%;
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 15px;
        `;
        
        const progressFill = document.createElement('div');
        progressFill.id = 'tts-progress-fill';
        progressFill.style.cssText = `
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            width: ${(current / total) * 100}%;
            transition: width 0.3s ease;
        `;
        
        const progressPercentage = document.createElement('div');
        progressPercentage.id = 'tts-progress-percentage';
        progressPercentage.style.cssText = `
            font-size: 14px;
            color: #666;
        `;
        progressPercentage.textContent = `${current}/${total} (${Math.round((current / total) * 100)}%)`;
        
        progressBar.appendChild(progressFill);
        progressBox.appendChild(progressText);
        progressBox.appendChild(progressBar);
        progressBox.appendChild(progressPercentage);
        modal.appendChild(progressBox);
        document.body.appendChild(modal);
    }

    // プログレス更新
    updateProgressModal(message, current, total) {
        const modal = document.getElementById('tts-progress-modal');
        if (!modal) return;
        
        const progressText = document.getElementById('tts-progress-text');
        const progressFill = document.getElementById('tts-progress-fill');
        const progressPercentage = document.getElementById('tts-progress-percentage');
        
        if (progressText) progressText.textContent = message;
        if (progressFill) progressFill.style.width = `${(current / total) * 100}%`;
        if (progressPercentage) progressPercentage.textContent = `${current}/${total} (${Math.round((current / total) * 100)}%)`;
    }

    // プログレス非表示
    hideProgressModal() {
        const modal = document.getElementById('tts-progress-modal');
        if (modal) {
            modal.remove();
        }
    }
}

// Content script初期化 - より確実でサイト互換性の高い初期化

let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

function initializeTextToVoice() {
    initializationAttempts++;
    
    try {
        // 既に初期化されている場合はスキップ
        if (window.textToVoiceContent) {
            return;
        }
        
        // 必要な要素が存在するかチェック
        if (!document.documentElement || (!document.body && initializationAttempts < MAX_INIT_ATTEMPTS)) {
            setTimeout(initializeTextToVoice, 200 * initializationAttempts);
            return;
        }
        
        window.textToVoiceContent = new TextToVoiceContent();
        
    } catch (error) {
        // 最大試行回数に達していない場合は再試行
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            setTimeout(initializeTextToVoice, 1000 * initializationAttempts);
        }
    }
}

// 複数のタイミングで初期化を試行（SPAや動的サイトに対応）
function startInitialization() {
    // 即座に試行
    initializeTextToVoice();
    
    // DOMContentLoadedイベント
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTextToVoice);
    }
    
    // windowのloadイベント
    window.addEventListener('load', initializeTextToVoice);
    
    // 一定時間後にも試行（SPA対応）
    setTimeout(initializeTextToVoice, 500);
    setTimeout(initializeTextToVoice, 2000);
}

// MutationObserverでDOM変更を監視（SPA対応）
let observer;
function startDOMObserver() {
    if (observer) return;
    
    observer = new MutationObserver((mutations) => {
        let shouldReinitialize = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.tagName === 'BODY' || node.contains(document.body))) {
                        shouldReinitialize = true;
                        break;
                    }
                }
            }
        }
        
        if (shouldReinitialize && !window.textToVoiceContent) {
            setTimeout(initializeTextToVoice, 100);
        }
    });
    
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

// 初期化開始
startInitialization();
startDOMObserver();