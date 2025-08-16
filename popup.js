// Text to Voice Reader - Popup Script
class TTSPopup {
    constructor() {
        this.settings = {
            apiKey: '',
            speed: 1.0,
            volume: 1.0,
            quality: 'medium',
            modelId: 'a59cb814-0083-4369-8542-f51a29e72af7', // デフォルト（女性）
            customModels: [] // カスタムモデル保存用
        };
        this.availableModels = [];
        this.init();
    }

    async init() {
        this.forcePopupSize();
        this.initializeElements();
        await this.loadSettings();
        this.attachEventListeners();
        this.updateUI();
        await this.loadAvailableModels();
        this.updateStatus('準備完了');
    }

    forcePopupSize() {
        // ポップアップサイズを強制的に設定
        document.documentElement.style.width = '400px';
        document.documentElement.style.height = '600px';
        document.body.style.width = '400px';
        document.body.style.height = '600px';
        document.body.style.minWidth = '400px';
        document.body.style.minHeight = '600px';
        document.body.style.maxWidth = '400px';
        document.body.style.maxHeight = '600px';
    }

    initializeElements() {
        // API設定
        this.apiKeyInput = document.getElementById('apiKey');
        this.toggleApiKeyBtn = document.getElementById('toggleApiKey');
        this.getApiKeyBtn = document.getElementById('getApiKeyBtn');
        this.apiStatus = document.getElementById('apiStatus');
        this.modelSelect = document.getElementById('modelSelect');
        this.customModelNameInput = document.getElementById('customModelName');
        this.customModelIdInput = document.getElementById('customModelId');
        this.addModelBtn = document.getElementById('addModelBtn');

        // 音声設定
        this.speedSlider = document.getElementById('speedSlider');
        this.speedValue = document.getElementById('speedValue');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.qualitySelect = document.getElementById('qualitySelect');

        // ボタン
        this.testBtn = document.getElementById('testBtn');
        this.helpBtn = document.getElementById('helpBtn');
        this.apiDemoBtn = document.getElementById('apiDemoBtn');
        this.aivisSiteBtn = document.getElementById('aivisSiteBtn');

        // UI要素
        this.helpSection = document.getElementById('helpSection');
        this.statusText = document.getElementById('statusText');
        this.notification = document.getElementById('notification');
        this.notificationText = document.getElementById('notificationText');
        this.notificationClose = document.getElementById('notificationClose');
    }

    async loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getSettings'
            });
            
            if (response && response.settings) {
                this.settings = response.settings;
            }
        } catch (error) {
            // 設定の読み込み失敗時は何もしない
        }
    }

    async saveSettings() {
        try {
            await chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: this.settings
            });
        } catch (error) {
            // 設定の保存失敗時は何もしない
        }
    }

    attachEventListeners() {
        // API設定
        this.apiKeyInput.addEventListener('input', () => {
            this.settings.apiKey = this.apiKeyInput.value.trim();
            this.saveSettings();
            this.updateApiStatus();
        });

        this.toggleApiKeyBtn.addEventListener('click', () => {
            this.toggleApiKeyVisibility();
        });

        this.getApiKeyBtn.addEventListener('click', () => {
            this.openApiKeyPage();
        });

        this.modelSelect.addEventListener('change', () => {
            this.settings.modelId = this.modelSelect.value;
            
            // 空白の場合は女性モデルをデフォルト選択
            if (!this.settings.modelId) {
                this.settings.modelId = 'a59cb814-0083-4369-8542-f51a29e72af7';
                this.modelSelect.value = this.settings.modelId;
            }
            
            this.saveSettings();
        });

        this.addModelBtn.addEventListener('click', () => {
            this.addCustomModel();
        });

        this.customModelNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addCustomModel();
            }
        });

        this.customModelIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addCustomModel();
            }
        });

        // 入力フィールドの変更を監視
        this.customModelNameInput.addEventListener('input', (e) => {
            // 入力内容を一時保存
            localStorage.setItem('tts_temp_model_name', e.target.value);
        });

        this.customModelIdInput.addEventListener('input', (e) => {
            // 入力内容を一時保存
            localStorage.setItem('tts_temp_model_id', e.target.value);
        });

        // 音声設定
        this.speedSlider.addEventListener('input', () => {
            this.settings.speed = parseFloat(this.speedSlider.value);
            this.speedValue.textContent = this.settings.speed.toFixed(1);
            this.saveSettings();
        });

        this.volumeSlider.addEventListener('input', () => {
            this.settings.volume = parseFloat(this.volumeSlider.value);
            this.volumeValue.textContent = Math.round(this.settings.volume * 100);
            this.saveSettings();
        });

        this.qualitySelect.addEventListener('change', () => {
            this.settings.quality = this.qualitySelect.value;
            this.saveSettings();
        });

        // ボタン
        this.testBtn.addEventListener('click', () => {
            this.testSpeech();
        });

        this.helpBtn.addEventListener('click', () => {
            this.toggleHelp();
        });

        this.apiDemoBtn.addEventListener('click', () => {
            this.openApiDemo();
        });

        this.aivisSiteBtn.addEventListener('click', () => {
            this.openAivisSite();
        });

        // 通知
        this.notificationClose.addEventListener('click', () => {
            this.hideNotification();
        });

        // URLパラメータをチェック（ウェルカム画面）
        const params = new URLSearchParams(window.location.search);
        if (params.get('welcome') === 'true') {
            this.showWelcome();
        }
    }

    updateUI() {
        // API設定
        this.apiKeyInput.value = this.settings.apiKey;
        
        // モデル選択（空白の場合は女性モデルをデフォルト選択）
        if (!this.settings.modelId) {
            this.settings.modelId = 'a59cb814-0083-4369-8542-f51a29e72af7';
            this.saveSettings();
        }
        this.modelSelect.value = this.settings.modelId;

        // 音声設定
        this.speedSlider.value = this.settings.speed;
        this.speedValue.textContent = this.settings.speed.toFixed(1);
        this.volumeSlider.value = this.settings.volume;
        this.volumeValue.textContent = Math.round(this.settings.volume * 100);
        this.qualitySelect.value = this.settings.quality;

        // 一時保存された入力値を復元
        const tempModelName = localStorage.getItem('tts_temp_model_name');
        const tempModelId = localStorage.getItem('tts_temp_model_id');
        if (tempModelName) {
            this.customModelNameInput.value = tempModelName;
        }
        if (tempModelId) {
            this.customModelIdInput.value = tempModelId;
        }

        this.updateApiStatus();
    }

    updateApiStatus() {
        const hasApiKey = this.settings.apiKey && this.settings.apiKey.trim().length > 0;
        
        if (hasApiKey) {
            this.apiStatus.className = 'status-indicator connected';
            this.apiStatus.innerHTML = '<span class="status-text">APIキーが設定されています ✓</span>';
        } else {
            this.apiStatus.className = 'status-indicator error';
            this.apiStatus.innerHTML = '<span class="status-text">APIキーを入力してください</span>';
        }
    }

    toggleApiKeyVisibility() {
        const isPassword = this.apiKeyInput.type === 'password';
        this.apiKeyInput.type = isPassword ? 'text' : 'password';
        this.toggleApiKeyBtn.textContent = isPassword ? '🙈' : '👁️';
    }

    async loadAvailableModels() {
        try {
            this.modelSelect.innerHTML = '<option value="">モデルを読み込み中...</option>';
            this.updateStatus('モデル一覧を取得中...');

            // デフォルトモデル（APIキーなしでも表示）
            const defaultModels = [
                {
                    uuid: 'a59cb814-0083-4369-8542-f51a29e72af7',
                    name: 'デフォルトモデル（女性）',
                    voice_type: 'female'
                }
            ];

            // デフォルトモデルと保存済みカスタムモデルを結合
            this.availableModels = [...defaultModels];
            
            // 保存されたカスタムモデルを追加
            if (this.settings.customModels && this.settings.customModels.length > 0) {
                this.availableModels.push(...this.settings.customModels);
            }
            
            this.populateModelSelect();
            
            // 保存された選択を復元、または女性モデルをデフォルト選択
            if (this.settings.modelId) {
                this.modelSelect.value = this.settings.modelId;
            } else {
                // デフォルトで女性モデルを選択
                const femaleModelId = 'a59cb814-0083-4369-8542-f51a29e72af7';
                this.modelSelect.value = femaleModelId;
                this.settings.modelId = femaleModelId;
                this.saveSettings();
            }
            
            // 選択が空白にならないように確認
            if (!this.modelSelect.value) {
                const femaleModelId = 'a59cb814-0083-4369-8542-f51a29e72af7';
                this.modelSelect.value = femaleModelId;
                this.settings.modelId = femaleModelId;
                this.saveSettings();
            }

        } catch (error) {
            this.showNotification('モデル一覧の取得に失敗しました', 'error');
        }
    }

    populateModelSelect() {
        this.modelSelect.innerHTML = '';
        
        // モデルを音声タイプ別にグループ化
        const groupedModels = {};
        this.availableModels.forEach(model => {
            const group = this.getVoiceTypeLabel(model.voice_type);
            if (!groupedModels[group]) {
                groupedModels[group] = [];
            }
            groupedModels[group].push(model);
        });

        // グループごとにオプションを追加
        Object.keys(groupedModels).forEach(groupName => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupName;
            
            groupedModels[groupName].forEach(model => {
                const option = document.createElement('option');
                option.value = model.uuid;
                option.textContent = model.name;
                optgroup.appendChild(option);
            });
            
            this.modelSelect.appendChild(optgroup);
        });
    }

    getVoiceTypeLabel(voiceType) {
        const labels = {
            'female': '女性の声',
            'male': '男性の声',
            'young_female': '若い女性の声',
            'young_male': '若い男性の声',
            'custom': 'カスタムモデル'
        };
        return labels[voiceType] || 'その他';
    }

    addCustomModel() {
        const customId = this.customModelIdInput.value.trim();
        const customName = this.customModelNameInput.value.trim();
        
        if (!customId) {
            this.showNotification('モデルUUIDを入力してください', 'error');
            return;
        }

        if (!customName) {
            this.showNotification('モデル名を入力してください', 'error');
            return;
        }

        // UUID形式をチェック
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidPattern.test(customId)) {
            this.showNotification('正しいUUID形式で入力してください', 'error');
            return;
        }
        
        // 既存チェック
        const exists = this.availableModels.some(model => model.uuid === customId);
        if (exists) {
            this.showNotification('このモデルは既に追加されています', 'warning');
            return;
        }

        // カスタムモデルを作成
        const customModel = {
            uuid: customId,
            name: customName,
            voice_type: 'custom'
        };

        // availableModelsに追加
        this.availableModels.push(customModel);
        
        // カスタムモデル配列に保存（永続化用）
        if (!this.settings.customModels) {
            this.settings.customModels = [];
        }
        this.settings.customModels.push(customModel);
        
        // UI更新
        this.populateModelSelect();
        
        // 追加したモデルを選択
        this.modelSelect.value = customId;
        this.settings.modelId = customId;
        
        // 設定を保存
        this.saveSettings();
        
        // 入力フィールドをクリア
        this.customModelNameInput.value = '';
        this.customModelIdInput.value = '';
        
        // 一時保存もクリア
        localStorage.removeItem('tts_temp_model_name');
        localStorage.removeItem('tts_temp_model_id');
        
        this.showNotification(`カスタムモデル「${customName}」を追加しました`, 'success');
    }

    async testSpeech() {
        if (!this.settings.apiKey) {
            this.showNotification('APIキーを設定してください', 'error');
            return;
        }

        const originalText = this.testBtn.innerHTML;
        this.testBtn.disabled = true;
        this.testBtn.innerHTML = '<span class="btn-icon">⏳</span>テスト中...';

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'generateSpeech',
                text: 'これはテスト音声です。設定が正しく動作しています。',
                settings: this.settings
            });

            if (response.success && response.audioData) {
                // Base64データからBlobURLを作成
                const base64String = response.audioData.base64Data;
                const binaryString = atob(base64String);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: response.audioData.mimeType || 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(blob);
                
                // 音声を再生
                const audio = new Audio(audioUrl);
                audio.volume = this.settings.volume;
                audio.playbackRate = this.settings.speed;
                
                audio.addEventListener('ended', () => {
                    URL.revokeObjectURL(audioUrl);
                });
                
                await audio.play();
                this.showNotification('音声テストが完了しました', 'success');
            } else {
                throw new Error(response.error);
            }

        } catch (error) {
            this.showNotification(`音声テストに失敗: ${error.message}`, 'error');
        } finally {
            this.testBtn.disabled = false;
            this.testBtn.innerHTML = originalText;
        }
    }

    toggleHelp() {
        const isVisible = this.helpSection.style.display !== 'none';
        this.helpSection.style.display = isVisible ? 'none' : 'block';
        this.helpBtn.innerHTML = isVisible ? 
            '<span class="btn-icon">❓</span>使い方' : 
            '<span class="btn-icon">📖</span>閉じる';
    }

    showWelcome() {
        this.showNotification('Text to Voice Readerへようこそ！まずはAPIキーを設定してください。', 'info');
        this.toggleHelp(); // ヘルプを表示
    }

    showNotification(message, type = 'info') {
        this.notificationText.textContent = message;
        this.notification.className = `notification ${type}`;
        
        // 3秒後に自動非表示
        setTimeout(() => {
            this.hideNotification();
        }, 3000);
    }

    hideNotification() {
        this.notification.className = 'notification hidden';
    }

    updateStatus(message) {
        this.statusText.textContent = message;
    }

    openApiKeyPage() {
        // AIVIS APIキー取得サイトを新しいタブで開く
        chrome.tabs.create({
            url: 'https://hub.aivis-project.com/cloud-api/api-keys',
            active: true
        });
    }

    openApiDemo() {
        // AIVIS APIデモサイトを新しいタブで開く
        chrome.tabs.create({
            url: 'https://api.aivis-project.com/v1/demo/realtime-streaming',
            active: true
        });
    }

    openAivisSite() {
        // AIVIS音声モデルサイトを新しいタブで開く
        chrome.tabs.create({
            url: 'https://hub.aivis-project.com/search',
            active: true
        });
    }
}

// ポップアップ初期化
document.addEventListener('DOMContentLoaded', () => {
    new TTSPopup();
});