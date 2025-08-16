// Text to Voice Reader - Background Script
class TTSBackground {
    constructor() {
        this.audioCache = new Map();
        this.settings = {
            apiKey: '',
            speed: 1.0,
            volume: 1.0,
            quality: 'medium',
            modelId: 'a59cb814-0083-4369-8542-f51a29e72af7' // デフォルト（女性）
        };
        this.init();
    }

    init() {
        this.loadSettings();
        this.setupMessageHandlers();
        this.setupContextMenu();
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

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'generateSpeech') {
                this.handleGenerateSpeech(message.text, message.settings)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ 
                        success: false, 
                        error: error.message 
                    }));
                return true; // 非同期レスポンスを示す
            }
            
            if (message.action === 'updateSettings') {
                this.updateSettings(message.settings);
                sendResponse({ success: true });
                return true;
            }
            
            if (message.action === 'getSettings') {
                sendResponse({ settings: this.settings });
                return true;
            }
        });
    }

    setupContextMenu() {
        // 既存のコンテキストメニューを削除してから作成
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'tts-read-selection',
                title: '選択したテキストを読み上げ',
                contexts: ['selection']
            });
        });

        chrome.contextMenus.onClicked.addListener(async (info, tab) => {
            if (info.menuItemId === 'tts-read-selection') {
                // Content scriptに読み上げ開始メッセージを送信
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'playSelectedText'
                    });
                } catch (error) {
                    // Content scriptが注入されていないタブは無視
                }
            }
        });
    }

    async handleGenerateSpeech(text, settings = {}) {
        try {
            // 設定をマージ
            const mergedSettings = { ...this.settings, ...settings };
            
            // APIキーをチェック
            if (!mergedSettings.apiKey) {
                throw new Error('AIVIS APIキーが設定されていません。拡張機能のポップアップから設定してください。');
            }

            // キャッシュキーを生成
            const cacheKey = `${text}_${mergedSettings.modelId}_${mergedSettings.quality}`;
            
            // キャッシュから確認
            if (this.audioCache.has(cacheKey)) {
                return {
                    success: true,
                    audioData: this.audioCache.get(cacheKey),
                    fromCache: true
                };
            }

            // AIVIS API経由で音声生成
            const audioData = await this.generateSpeechFromAPI(text, mergedSettings);
            
            // キャッシュに保存（最大50個まで）
            if (this.audioCache.size >= 50) {
                const firstKey = this.audioCache.keys().next().value;
                this.audioCache.delete(firstKey);
            }
            
            this.audioCache.set(cacheKey, audioData);

            return {
                success: true,
                audioData: audioData,
                fromCache: false
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async generateSpeechFromAPI(text, settings) {
        const apiUrl = 'https://api.aivis-project.com/v1/tts/synthesize';
        
        // 一時的にSSMLを無効化（元の動作に戻す）
        const requestData = {
            model_uuid: settings.modelId,
            text: text,
            use_ssml: true,
            output_format: 'mp3'
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                let errorMessage = `AIVIS API エラー: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.detail) {
                        errorMessage += ` - ${errorData.detail}`;
                    } else if (errorData.message) {
                        errorMessage += ` - ${errorData.message}`;
                    }
                } catch (e) {
                    // JSON解析エラーは無視
                }
                
                // 特定のエラーコードに対するフォールバック処理
                if (response.status === 401) {
                    throw new Error('APIキーが無効です。正しいAPIキーを設定してください。');
                } else if (response.status === 429) {
                    throw new Error('APIの利用制限に達しました。しばらく待ってから再試行してください。');
                } else if (response.status >= 500) {
                    // サーバーエラーの場合はフォールバック音声を試行
                    console.warn('AIVIS APIサーバーエラー、フォールバックを実行');
                    return await this.generateFallbackSpeech(text, settings);
                }
                
                throw new Error(errorMessage);
            }

            // レスポンスをBlobに変換
            const audioBlob = await response.blob();
            
            if (audioBlob.size <= 50) {
                return await this.generateFallbackSpeech(text, settings);
            }

            // BlobをBase64に変換してcontent scriptに送信（ArrayBufferはメッセージングで失われるため）
            const arrayBuffer = await audioBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // 大きな配列でもスタックオーバーフローしない安全なBase64変換
            let binaryString = '';
            const chunkSize = 8192; // 8KB ずつ処理
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                binaryString += String.fromCharCode.apply(null, chunk);
            }
            const base64String = btoa(binaryString);

            return {
                base64Data: base64String,
                mimeType: audioBlob.type || 'audio/mpeg'
            };

        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                return await this.generateFallbackSpeech(text, settings);
            }
            
            throw error;
        }
    }

    // フォールバック音声生成（Service Workerでは利用不可）
    async generateFallbackSpeech(text, settings) {
        throw new Error('音声生成に失敗しました。AIVIS APIが利用できません。APIキーと設定を確認してください。');
    }

    async updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        
        try {
            await chrome.storage.sync.set({
                ttsSettings: this.settings
            });
            
            // 全タブのcontent scriptに設定変更を通知
            this.notifySettingsChange();
        } catch (error) {
            // 設定保存失敗時は何もしない
        }
    }

    // 全タブのcontent scriptに設定変更を通知
    async notifySettingsChange() {
        try {
            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'settingsChanged',
                        settings: this.settings
                    });
                } catch (error) {
                    // content scriptが注入されていないタブは無視
                }
            }
        } catch (error) {
            // 通知失敗時は何もしない
        }
    }

    // ユーティリティメソッド: APIキーの有効性をテスト
    async testApiKey(apiKey) {
        try {
            const testText = 'テスト';
            const response = await fetch('https://api.aivis-project.com/v1/tts/synthesize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model_uuid: this.settings.modelId,
                    text: testText,
                    use_ssml: true,
                    output_format: 'mp3'
                })
            });

            if (response.ok) {
                return { valid: true, message: 'APIキーは有効です' };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return { 
                    valid: false, 
                    message: errorData.detail || 'APIキーが無効です' 
                };
            }

        } catch (error) {
            return { 
                valid: false, 
                message: `接続エラー: ${error.message}` 
            };
        }
    }
}

// Background script初期化
const ttsBackground = new TTSBackground();

// Chrome拡張のインストール時
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Text to Voice Reader が正常にインストールされました');
        
        // 初回インストール時にタブを開く
        chrome.tabs.create({
            url: chrome.runtime.getURL('popup.html') + '?welcome=true'
        });
    }
});