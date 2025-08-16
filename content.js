class TextToVoiceContent {
    constructor() {
        this.selectedText = '';
        this.isPlaying = false;
        this.currentAudio = null;
        this.lastAudioData = null; // 最後に生成した音声データを保存
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
        console.log('Text to Voice Reader Content Script が初期化されました');
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
            const currentText = window.getSelection().toString().trim();
            
            if (currentText !== lastSelectedText) {
                console.log('ポーリングでテキスト選択変更を検出:', currentText.substring(0, 30));
                lastSelectedText = currentText;
                this.handleTextSelection(null);
            }
        };
        
        // 500msごとにチェック
        setInterval(checkSelection, 500);
        console.log('テキスト選択ポーリングを開始しました');
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['ttsSettings']);
            if (result.ttsSettings) {
                this.settings = { ...this.settings, ...result.ttsSettings };
            }
        } catch (error) {
            console.error('設定の読み込みに失敗:', error);
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
            <button class="tts-button tts-download-btn" style="display: none;">
                <span class="tts-icon">📥</span>
                <span class="tts-text">MP3</span>
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
        console.log('シンプルボタンを作成しました');
    }

    attachEventListeners() {
        console.log('イベントリスナーを設定しています');
        
        // 複数のイベントタイプを監視
        const events = ['mouseup', 'click', 'selectionchange'];
        
        events.forEach(eventType => {
            if (eventType === 'selectionchange') {
                // selectionchangeはdocumentに追加
                document.addEventListener(eventType, (e) => {
                    console.log('selectionchange イベント発生');
                    setTimeout(() => {
                        this.handleTextSelection(e);
                    }, 50);
                });
            } else {
                // その他のイベントはbubbleフェーズとcaptureフェーズの両方で監視
                document.addEventListener(eventType, (e) => {
                    console.log(`${eventType} イベント発生 (bubble)`);
                    setTimeout(() => {
                        this.handleTextSelection(e);
                    }, 10);
                }, false);
                
                document.addEventListener(eventType, (e) => {
                    console.log(`${eventType} イベント発生 (capture)`);
                    setTimeout(() => {
                        this.handleTextSelection(e);
                    }, 10);
                }, true);
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
                e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                this.handleTextSelection(e);
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
                if (!e.target.closest('.tts-button') && !window.getSelection().toString().trim()) {
                    this.hideButton();
                }
            }, 100);
        });

        // スクロール時にボタンを非表示
        document.addEventListener('scroll', () => {
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
            
            console.log('検出されたテキスト選択:', {
                text: selectedText,
                length: selectedText.length,
                selectionType: selection ? selection.type : 'unknown',
                rangeCount: selection ? selection.rangeCount : 0
            });
            
        } catch (error) {
            console.error('テキスト選択検出エラー:', error);
        }
        
        if (selectedText && selectedText.length > 0) {
            console.log('ボタン表示条件を満たしました:', selectedText.substring(0, 50));
            this.selectedText = selectedText;
            this.showButton(e);
        } else {
            console.log('テキストが選択されていないか、条件を満たしていません');
            this.hideButton();
        }
    }

    showButton(e) {
        if (!this.button || !document.contains(this.button)) {
            console.error('ボタンが存在しないか、DOMから削除されています');
            return;
        }
        
        console.log('showButton() が呼び出されました');
        
        const selection = window.getSelection();
        console.log('選択情報:', {
            rangeCount: selection.rangeCount,
            toString: selection.toString()
        });
        
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            console.log('選択範囲の位置:', rect);
            
            // ボタンの位置を選択範囲の右上に設定（固定位置なのでscrollは不要）
            const x = rect.right + 10;
            const y = rect.top - 45;
            
            // 画面内に収まるように位置を調整
            const buttonWidth = 120;
            const adjustedX = Math.max(10, Math.min(x, window.innerWidth - buttonWidth - 10));
            const adjustedY = Math.max(10, Math.max(y, 10)); // 最低10px上から
            
            console.log('ボタンの配置位置:', {
                original: { x, y },
                adjusted: { x: adjustedX, y: adjustedY },
                windowSize: { width: window.innerWidth, height: window.innerHeight }
            });
            
            // ボタンを選択範囲の近くに表示
            this.button.style.setProperty('left', `${adjustedX}px`, 'important');
            this.button.style.setProperty('top', `${adjustedY}px`, 'important');
            this.button.style.setProperty('z-index', '2147483647', 'important');
            this.button.style.setProperty('display', 'flex', 'important');
            this.button.style.setProperty('position', 'fixed', 'important');
            this.button.style.setProperty('visibility', 'visible', 'important');
            this.button.style.setProperty('opacity', '1', 'important');
            
            console.log('ボタンのスタイルを適用しました:', {
                display: this.button.style.display,
                visibility: this.button.style.visibility,
                position: this.button.style.position,
                left: this.button.style.left,
                top: this.button.style.top,
                zIndex: this.button.style.zIndex
            });
            
            // アニメーション効果を簡素化
            this.button.style.setProperty('opacity', '0', 'important');
            setTimeout(() => {
                if (this.button && document.contains(this.button)) {
                    this.button.style.setProperty('opacity', '1', 'important');
                    console.log('ボタンのフェードイン完了');
                }
            }, 50);
            
            console.log('ボタン表示処理完了');
        } else {
            console.log('選択範囲が見つかりませんでした');
        }
    }

    hideButton() {
        this.button.style.setProperty('display', 'none', 'important');
        this.button.style.setProperty('visibility', 'hidden', 'important');
        this.downloadButton.style.display = 'none';
        this.selectedText = '';
    }

    downloadAudio() {
        if (!this.lastAudioData) {
            this.showNotification('ダウンロードする音声がありません', 'error');
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

        // 長すぎるテキストの制限
        if (text.length > 1000) {
            text = text.substring(0, 1000) + '...';
            this.showNotification('テキストが長いため、最初の1000文字を読み上げます', 'warning');
        }

        try {
            this.setPlayingState(true);
            
            // Background scriptに音声生成を依頼
            const response = await chrome.runtime.sendMessage({
                action: 'generateSpeech',
                text: text,
                settings: this.settings
            });

            if (response.success && response.audioData) {
                console.log('受信したaudioDataの内容:', response.audioData);
                
                // 音声データを保存（ダウンロード用）
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
                
                console.log('変換後のArrayBuffer:', {
                    isArrayBuffer: arrayBuffer instanceof ArrayBuffer,
                    byteLength: arrayBuffer.byteLength,
                    mimeType: response.audioData.mimeType
                });
                
                // ダウンロードボタンを表示
                this.downloadButton.style.display = 'flex';
                
                // Web Audio APIで直接ArrayBufferから再生（CSP制限回避）
                await this.playAudioBuffer(arrayBuffer);
            } else {
                throw new Error(response.error || '音声生成に失敗しました');
            }

        } catch (error) {
            console.error('音声再生エラー:', error);
            this.showNotification(`音声再生エラー: ${error.message}`, 'error');
            this.setPlayingState(false);
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

            this.currentAudio.addEventListener('loadstart', () => {
                console.log('音声読み込み開始');
            });

            this.currentAudio.addEventListener('canplaythrough', () => {
                console.log('音声再生準備完了');
            });

            this.currentAudio.addEventListener('play', () => {
                console.log('音声再生開始');
            });

            this.currentAudio.addEventListener('ended', () => {
                console.log('音声再生終了');
                this.setPlayingState(false);
                if (audioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(audioUrl);
                }
                resolve();
            });

            this.currentAudio.addEventListener('error', (e) => {
                console.error('音声再生エラー:', e);
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
                console.error('音声再生開始エラー:', error);
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
                // AudioContextを作成
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // ArrayBufferを音声データにデコード
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // AudioBufferSourceNodeを作成
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                // ボリューム調整
                const gainNode = audioContext.createGain();
                gainNode.gain.value = this.settings.volume || 1.0;
                
                // 速度調整（ピッチも変わりますが、一旦元の動作に戻します）
                source.playbackRate.value = this.settings.speed || 1.0;
                
                // 接続: source → gainNode → destination
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // 再生終了のイベントリスナー
                source.onended = () => {
                    this.setPlayingState(false);
                    this.showNotification('AIVIS音声の再生が完了しました', 'success');
                    audioContext.close();
                    resolve();
                };
                
                // エラーハンドリング
                source.onerror = (error) => {
                    this.setPlayingState(false);
                    audioContext.close();
                    reject(new Error('Web Audio API再生エラー'));
                };
                
                // 再生開始
                this.setPlayingState(true);
                this.showNotification('AIVIS音声を再生中...', 'info');
                console.log('Web Audio API音声開始');
                source.start(0);
                
            } catch (error) {
                console.error('Web Audio API エラー:', error);
                this.setPlayingState(false);
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
                console.log('Web Speech API音声開始');
                this.setPlayingState(true);
                this.showNotification('ブラウザ標準音声で再生中', 'info');
            };

            utterance.onend = () => {
                console.log('Web Speech API音声終了');
                this.setPlayingState(false);
                resolve();
            };

            utterance.onerror = (event) => {
                console.error('Web Speech APIエラー:', event.error);
                this.setPlayingState(false);
                reject(new Error(`Web Speech APIエラー: ${event.error}`));
            };

            speechSynthesis.speak(utterance);
        });
    }

    stopPlayback() {
        // 通常の音声を停止
        if (this.currentAudio && !this.currentAudio.paused) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }
        
        // Web Speech APIの音声も停止
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        this.setPlayingState(false);
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
            background: ${type === 'error' ? '#ff4757' : type === 'warning' ? '#ffa502' : '#5352ed'};
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
}

// Content script初期化 - より確実でサイト互換性の高い初期化
console.log('Text to Voice Reader Content Script が読み込まれました - document.readyState:', document.readyState);

let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

function initializeTextToVoice() {
    initializationAttempts++;
    console.log(`TextToVoiceContent 初期化試行 ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`);
    
    try {
        // 既に初期化されている場合はスキップ
        if (window.textToVoiceContent) {
            console.log('TextToVoiceContent は既に初期化されています');
            return;
        }
        
        // 必要な要素が存在するかチェック
        if (!document.documentElement || (!document.body && initializationAttempts < MAX_INIT_ATTEMPTS)) {
            console.log('DOM要素が準備されていません。再試行します...');
            setTimeout(initializeTextToVoice, 200 * initializationAttempts);
            return;
        }
        
        window.textToVoiceContent = new TextToVoiceContent();
        console.log('TextToVoiceContent の初期化が完了しました');
        
    } catch (error) {
        console.error('TextToVoiceContent の初期化中にエラーが発生:', error);
        
        // 最大試行回数に達していない場合は再試行
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            console.log(`${1000 * initializationAttempts}ms後に再試行します...`);
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
            console.log('DOM変更を検出。再初期化します...');
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