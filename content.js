class TextToVoiceContent {
    constructor() {
        this.selectedText = '';
        this.isPlaying = false;
        this.currentAudio = null;
        this.settings = {
            speed: 1.0,
            volume: 1.0,
            quality: 'medium',
            modelId: 'a59cb814-0083-4369-8542-f51a29e72af7'
        };
        
        this.init();
    }

    init() {
        console.log('Text to Voice Reader Content Script が初期化されました');
        this.loadSettings();
        this.createUI();
        this.attachEventListeners();
        this.setupContextMenu();
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

    createUI() {
        console.log('createUI が呼び出されました');
        console.log('document.body:', document.body);
        console.log('document.body exists:', !!document.body);
        
        // 読み上げボタンのスタイルを注入
        const style = document.createElement('style');
        style.textContent = `
            .tts-button {
                position: fixed !important;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                color: white !important;
                border: none !important;
                border-radius: 25px !important;
                padding: 12px 20px !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                z-index: 999999 !important;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4) !important;
                transition: all 0.3s ease !important;
                display: none !important;
                align-items: center !important;
                gap: 8px !important;
                backdrop-filter: blur(10px) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important;
                min-width: 120px !important;
                white-space: nowrap !important;
                pointer-events: auto !important;
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
        document.head.appendChild(style);
        console.log('スタイルを追加しました');

        // bodyが存在しない場合は待機
        if (!document.body) {
            console.log('document.body が存在しません。待機します...');
            setTimeout(() => this.createButton(), 100);
            return;
        }
        
        this.createButton();
    }
    
    createButton() {
        console.log('createButton が呼び出されました');
        
        // 読み上げボタンを作成
        this.button = document.createElement('button');
        this.button.className = 'tts-button';
        this.button.innerHTML = `
            <span class="tts-icon">🔊</span>
            <span class="tts-text">読み上げ</span>
        `;
        this.button.id = 'tts-reader-button'; // デバッグ用ID
        
        // 強制的にスタイルを適用
        this.button.style.cssText = `
            position: fixed !important;
            left: 20px !important;
            top: 20px !important;
            background: red !important;
            color: white !important;
            padding: 10px 20px !important;
            border: none !important;
            border-radius: 5px !important;
            z-index: 999999 !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            font-size: 16px !important;
        `;
        
        if (document.body) {
            document.body.appendChild(this.button);
            console.log('読み上げボタンを作成しました:', {
                element: this.button,
                parent: this.button.parentNode,
                className: this.button.className,
                innerHTML: this.button.innerHTML,
                inDOM: document.contains(this.button)
            });
        } else {
            console.error('document.body が見つかりません');
            // bodyがない場合はdocumentElementに追加
            document.documentElement.appendChild(this.button);
            console.log('documentElementに追加しました');
        }
    }

    attachEventListeners() {
        // テキスト選択イベント（少し遅延させる）
        document.addEventListener('mouseup', (e) => {
            setTimeout(() => {
                this.handleTextSelection(e);
            }, 10);
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
                e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                this.handleTextSelection(e);
            }
        });

        // 読み上げボタンクリック
        this.button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleButtonClick();
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
        console.log('テキスト選択イベントが発生しました');
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        console.log('選択されたテキスト:', selectedText);
        
        if (selectedText && selectedText.length > 0) {
            this.selectedText = selectedText;
            console.log('読み上げボタンを表示します');
            this.showButton(e);
        } else {
            console.log('テキストが選択されていないためボタンを非表示にします');
            this.hideButton();
        }
    }

    showButton(e) {
        console.log('showButton が呼び出されました');
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            console.log('選択範囲の位置:', rect);
            
            // ボタンの位置を選択範囲の右上に設定
            const x = rect.right + window.scrollX + 10;
            const y = rect.top + window.scrollY - 45;
            
            // 画面内に収まるように位置を調整
            const buttonWidth = 120; // ボタンの幅
            const adjustedX = Math.max(10, Math.min(x, window.innerWidth - buttonWidth - 10));
            const adjustedY = Math.max(10, y);
            
            console.log('ボタンの配置位置:', { 
                original: { x, y }, 
                adjusted: { x: adjustedX, y: adjustedY },
                windowWidth: window.innerWidth 
            });
            
            // デバッグ用: ボタンを画面左上に固定表示
            this.button.style.setProperty('left', '20px', 'important');
            this.button.style.setProperty('top', '20px', 'important');
            this.button.style.setProperty('z-index', '999999', 'important');
            this.button.style.setProperty('display', 'flex', 'important');
            this.button.style.setProperty('position', 'fixed', 'important');
            this.button.style.setProperty('visibility', 'visible', 'important');
            this.button.style.setProperty('opacity', '1', 'important');
            
            console.log('ボタンのスタイル:', {
                display: this.button.style.display,
                left: this.button.style.left,
                top: this.button.style.top,
                zIndex: this.button.style.zIndex,
                position: this.button.style.position
            });
            
            console.log('ボタンを表示しました');
            
            // デバッグ用: アニメーション効果を無効化
            // this.button.style.opacity = '0';
            // this.button.style.transform = 'translateY(10px)';
            // setTimeout(() => {
            //     this.button.style.transition = 'all 0.3s ease';
            //     this.button.style.opacity = '1';
            //     this.button.style.transform = 'translateY(0px)';
            // }, 10);
        } else {
            console.log('選択範囲が見つかりませんでした');
        }
    }

    hideButton() {
        this.button.style.setProperty('display', 'none', 'important');
        this.button.style.setProperty('visibility', 'hidden', 'important');
        this.selectedText = '';
        console.log('ボタンを非表示にしました');
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

            if (response.success && response.audioUrl) {
                await this.playAudio(response.audioUrl);
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
            this.button.classList.add('playing');
            this.button.innerHTML = `
                <span class="tts-icon">⏸️</span>
                <span class="tts-text">停止</span>
            `;
        } else {
            this.button.classList.remove('playing');
            this.button.innerHTML = `
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

// Content script初期化 - より確実な初期化
console.log('Content Script が読み込まれました - document.readyState:', document.readyState);

function initializeTextToVoice() {
    console.log('TextToVoiceContent を初期化します');
    try {
        window.textToVoiceContent = new TextToVoiceContent();
        console.log('TextToVoiceContent の初期化が完了しました');
    } catch (error) {
        console.error('TextToVoiceContent の初期化中にエラーが発生:', error);
    }
}

// 複数のタイミングで初期化を試行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTextToVoice);
} else if (document.readyState === 'interactive' || document.readyState === 'complete') {
    // ドキュメントが既に読み込まれている場合は即座に初期化
    initializeTextToVoice();
} else {
    // フォールバック: 少し待ってから初期化
    setTimeout(initializeTextToVoice, 100);
}