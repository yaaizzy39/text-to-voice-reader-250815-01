# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Chrome Extension Development
- **Load Extension**: Chrome → Extensions → Developer Mode ON → "Load unpacked" → select this folder
- **Reload Extension**: Click reload button in Chrome extensions page after code changes
- **Debug**: Use Chrome DevTools for popup (right-click extension icon → Inspect popup) and content scripts (F12 on webpage)

### Testing AIVIS API
- **Test API Key**: Use the "音声テスト" button in the popup to verify AIVIS API connectivity
- **Manual API Test**: Check `background.js` console logs for API request/response details
- **Endpoint**: https://api.aivis-project.com/v1/tts/synthesize (not `/v1/tts/stream`)

## Architecture Overview

### Chrome Extension Structure (Manifest V3)
This is a Chrome extension that converts selected webpage text to speech using AIVIS Cloud API with Web Speech API fallback.

**Core Components:**
- `background.js` - Service worker handling AIVIS API communication, caching, and Chrome extension messaging
- `content.js` - Injected into all webpages, handles text selection UI and audio playback
- `popup.js/html/css` - Extension settings interface accessed via toolbar icon
- `manifest.json` - Extension configuration with permissions for storage, activeTab, contextMenus

### Message Flow Architecture
```
Content Script → Background Script → AIVIS API
       ↓              ↓                ↓
   UI Events     API Requests    Audio Response
       ↓              ↓                ↓
Text Selection → Cache/Settings → Audio Playback
```

### API Integration Pattern
- **Primary**: AIVIS Cloud API (`https://api.aivis-project.com/v1/tts/synthesize`)
- **Fallback**: Web Speech API when AIVIS fails
- **Request Format**: `{model_uuid, text, use_ssml: true, output_format: 'mp3'}`
- **Authentication**: Bearer token from user's API key stored in Chrome sync storage

### Error Handling Strategy
Multi-level fallback system:
1. AIVIS API success → Direct audio playback
2. AIVIS API error (401/429) → User-friendly error messages  
3. AIVIS API error (5xx) or network failure → Automatic Web Speech API fallback
4. Web Speech API failure → Final error state

### State Management
- **Settings**: Chrome storage sync API for cross-device persistence
- **Audio Cache**: In-memory Map in background script (max 50 entries with LRU eviction)
- **UI State**: Local state in content script instances

## Key Implementation Details

### Content Script Text Selection
- Uses `mouseup` and `keyup` events to detect text selection
- Dynamically positions floating "読み上げ" button near selected text
- Handles page scrolling and window resizing to hide/reposition UI

### Background Script API Management
- Implements audio caching with blob URL management
- Handles Chrome extension lifecycle (install/update events)  
- Creates context menu items for right-click text-to-speech
- Manages API key validation and testing

### Popup Settings Interface
- Fixed dimensions (400x600px) to prevent Chrome popup instability
- Real-time settings sync via Chrome messaging API
- Custom model UUID support for advanced AIVIS users
- Audio quality, speed, and volume controls

### Reference Implementation
This extension was migrated from `example-talk-avatar-250725-02/script.js`, specifically:
- AIVIS API integration patterns (lines 762-794)
- Audio streaming and playback logic (lines 818-932)  
- Error handling and fallback mechanisms (lines 754-760)
- Settings management (lines 796-816)

## Critical Configuration

### AIVIS API Endpoint
Always use `https://api.aivis-project.com/v1/tts/synthesize` - the `/v1/tts/stream` endpoint from original code causes 404 errors.

### Required Request Format
```javascript
{
    model_uuid: settings.modelId,  // Not 'model_id'
    text: text,
    use_ssml: true,               // Required for proper processing
    output_format: 'mp3'          // Not 'format'
}
```

### Chrome Extension Permissions
- `storage` - For settings persistence
- `activeTab` - For content script injection 
- `contextMenus` - For right-click menu integration
- `https://api.aivis-project.com/*` - For AIVIS API access

### Common Issues
- **Popup Window Shaking**: Fixed by enforcing strict CSS dimensions and `position: fixed`
- **API 404 Errors**: Usually wrong endpoint URL - verify `/v1/tts/synthesize`
- **Content Script Not Loading**: Check manifest.json matches pattern and reload extension