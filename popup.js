// Text to Voice Reader - Popup Script
class TTSPopup {
    constructor() {
        this.settings = {
            apiKey: '',
            speed: 1.0,
            volume: 1.0,
            quality: 'medium',
            modelId: 'a59cb814-0083-4369-8542-f51a29e72af7' // デフォルト（女性）
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
        this.apiStatus = document.getElementById('apiStatus');
        this.modelSelect = document.getElementById('modelSelect');
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
            console.error('設定の読み込みに失敗:', error);
        }
    }

    async saveSettings() {
        try {
            await chrome.runtime.sendMessage({
                action: 'updateSettings',
                settings: this.settings
            });
            console.log('設定を保存しました:', this.settings);
        } catch (error) {
            console.error('設定の保存に失敗:', error);
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

        this.modelSelect.addEventListener('change', () => {
            this.settings.modelId = this.modelSelect.value;
            this.saveSettings();
        });

        this.addModelBtn.addEventListener('click', () => {
            this.addCustomModel();
        });

        this.customModelIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addCustomModel();
            }
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
        this.modelSelect.value = this.settings.modelId;

        // 音声設定
        this.speedSlider.value = this.settings.speed;
        this.speedValue.textContent = this.settings.speed.toFixed(1);
        this.volumeSlider.value = this.settings.volume;
        this.volumeValue.textContent = Math.round(this.settings.volume * 100);
        this.qualitySelect.value = this.settings.quality;

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

            this.availableModels = defaultModels;
            this.populateModelSelect();
            
            // 保存された選択を復元
            if (this.settings.modelId) {
                this.modelSelect.value = this.settings.modelId;
            }

        } catch (error) {
            console.error('モデル一覧の取得に失敗:', error);
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
            'young_male': '若い男性の声'
        };
        return labels[voiceType] || 'その他';
    }

    addCustomModel() {
        const customId = this.customModelIdInput.value.trim();
        
        if (!customId) {
            this.showNotification('モデルUUIDを入力してください', 'error');
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

        // カスタムモデルを追加
        const customModel = {
            uuid: customId,
            name: `カスタムモデル (${customId.substring(0, 8)}...)`,
            voice_type: 'custom'
        };

        this.availableModels.push(customModel);
        this.populateModelSelect();
        
        // 追加したモデルを選択
        this.modelSelect.value = customId;
        this.settings.modelId = customId;
        this.saveSettings();
        
        // 入力フィールドをクリア
        this.customModelIdInput.value = '';
        
        this.showNotification('カスタムモデルを追加しました', 'success');
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

            if (response.success) {
                // 音声を再生
                const audio = new Audio(response.audioUrl);
                audio.volume = this.settings.volume;
                audio.playbackRate = this.settings.speed;
                
                audio.addEventListener('ended', () => {
                    URL.revokeObjectURL(response.audioUrl);
                });
                
                await audio.play();
                this.showNotification('音声テストが完了しました', 'success');
            } else {
                throw new Error(response.error);
            }

        } catch (error) {
            console.error('音声テストエラー:', error);
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
}

// ポップアップ初期化
document.addEventListener('DOMContentLoaded', () => {
    new TTSPopup();
});