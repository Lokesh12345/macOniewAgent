# Universal Video Control API Documentation

## Overview

The Universal Video Handler provides a unified interface for AI agents to control video playback across any web platform. It automatically detects and adapts to different video players (YouTube, Vimeo, Netflix, HTML5, etc.) without requiring platform-specific code.

## Quick Start

### Mac App Usage
```swift
// Basic controls
connectionManager.executeVideoControl(action: "play")
connectionManager.executeVideoControl(action: "pause")
connectionManager.executeVideoControl(action: "toggle")

// Seeking with natural language
connectionManager.executeVideoControl(action: "seek", time: "2:30")
connectionManager.executeVideoControl(action: "seek", time: "50%")
connectionManager.executeVideoControl(action: "seek", time: "middle")

// Relative seeking
connectionManager.executeVideoControl(action: "seekForward", amount: 10)
connectionManager.executeVideoControl(action: "seekBackward", amount: 30)

// Volume and speed control
connectionManager.executeVideoControl(action: "setVolume", time: "75")
connectionManager.executeVideoControl(action: "setPlaybackRate", time: "1.5")

// Caption controls
connectionManager.executeVideoCaptionControl(action: "getCaptions")
connectionManager.executeVideoCaptionControl(action: "enableCaption", language: "en")
connectionManager.executeVideoCaptionControl(action: "enableCaption", language: "es")
connectionManager.executeVideoCaptionControl(action: "disableCaptions")
connectionManager.executeVideoCaptionControl(action: "getCurrentCaption")
```

### Agent/LLM Parameters
When calling from an agent, use the `videoControl` action with these parameters:

```json
{
  "action": "videoControl",
  "action": "seek",
  "time": "2:30",
  "amount": 10
}
```

## Video Actions

### Playback Controls

| Action | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `play` | Start video playback | None | `action: "play"` |
| `pause` | Pause video playback | None | `action: "pause"` |
| `toggle` | Toggle play/pause state | None | `action: "toggle"` |

### Seeking Controls

| Action | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `seek` | Seek to specific time | `time` | `action: "seek", time: "2:30"` |
| `seekForward` | Skip forward | `amount` (seconds) | `action: "seekForward", amount: 10` |
| `seekBackward` | Rewind backward | `amount` (seconds) | `action: "seekBackward", amount: 30` |
| `seekToStart` | Jump to beginning | None | `action: "seekToStart"` |
| `seekToEnd` | Jump to end (5s before) | None | `action: "seekToEnd"` |

### Audio Controls

| Action | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `setVolume` | Set volume level | `time` (0-100) | `action: "setVolume", time: "75"` |
| `mute` | Mute audio | None | `action: "mute"` |
| `unmute` | Unmute audio | None | `action: "unmute"` |

### Playback Rate

| Action | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `setPlaybackRate` | Change video speed | `time` (0.25-4.0) | `action: "setPlaybackRate", time: "1.5"` |

### Caption/Subtitle Controls

| Action | Description | Parameters | Example |
|--------|-------------|------------|----------|
| `getCaptions` | List available captions | None | `action: "getCaptions"` |
| `enableCaption` | Enable specific caption | `time` (language code) | `action: "enableCaption", time: "en"` |
| `disableCaptions` | Disable all captions | None | `action: "disableCaptions"` |
| `getCurrentCaption` | Get current caption text | None | `action: "getCurrentCaption"` |
| `extractAllCaptions` | Extract all caption text | None | `action: "extractAllCaptions"` |
| `getCaptionText` | Get caption at specific time | `time` (seconds) | `action: "getCaptionText", time: "125.5"` |

### Information

| Action | Description | Parameters | Example |
|--------|-------------|------------|---------|
| `getInfo` | Get video status | None | `action: "getInfo"` |

## Time Format Support

The system supports multiple time input formats for maximum flexibility:

### Exact Time
- `"30"` - 30 seconds
- `"2:30"` - 2 minutes 30 seconds  
- `"1:15:45"` - 1 hour 15 minutes 45 seconds
- `"30s"`, `"120sec"` - Seconds with units
- `"2m"`, `"5min"` - Minutes with units

### Relative Positions
- `"start"`, `"beginning"` - Start of video
- `"middle"`, `"center"` - Middle of video  
- `"end"`, `"finish"` - End of video

### Percentage
- `"25%"` - 25% through the video
- `"50%"` - Halfway point
- `"90%"` - Near the end

## Platform Support

The handler automatically detects and adapts to these video platforms:

### Officially Supported APIs
- **YouTube** - Uses iframe Player API (`YT.Player`), limited caption access
- **Vimeo** - Uses Player.js SDK (`Vimeo.Player`), full caption API support

### HTML5 Video Support
- **Netflix** - Attempts internal API, falls back to HTML5
- **Amazon Prime Video** - HTML5 video controls with TextTrack API
- **Hulu, Disney+** - HTML5 video controls with TextTrack API
- **Generic HTML5** - Any `<video>` element with TextTrack support

### Custom Players
- **Custom web players** - DOM manipulation fallback
- **Embedded players** - Automatic detection

### Caption Support by Platform

| Platform | Detection | Enable/Disable | Text Extraction | Full Transcript | Time Lookup |
|----------|-----------|----------------|-----------------|----------------|-------------|
| **YouTube** | Limited | DOM manipulation | ❌ Not available | ❌ | ❌ |
| **Vimeo** | Full API | Full API | ❌ Not available | ❌ | ❌ |
| **HTML5** | TextTrack API | TextTrack API | ✅ Full access | ✅ Without playback | ✅ |
| **Netflix** | DOM fallback | DOM fallback | ❌ Limited | ❌ | ❌ |
| **Others** | TextTrack API | TextTrack API | ✅ Where available | ✅ HTML5 only | ✅ HTML5 only |

**Key**: ✅ = Fully supported, ❌ = Not available

## Response Format

All video actions return a standardized response:

### Success Response
```json
{
  "success": true,
  "message": "Video playing",
  "playerType": "youtube",
  "time": 150.5,
  "duration": 600.0
}
```

### Error Response
```json
{
  "success": false,
  "error": "No video player detected on this page",
  "action": "play"
}
```

### Video Info Response
```json
{
  "success": true,
  "playerType": "html5",
  "currentTime": 125.75,
  "duration": 480.0,
  "progress": 26.2,
  "isPlaying": true,
  "formattedTime": "2:05 / 8:00",
  "url": "https://example.com/video"
}
```

### Caption List Response
```json
{
  "success": true,
  "playerType": "html5",
  "captions": [
    {
      "kind": "subtitles",
      "language": "en",
      "label": "English",
      "mode": "showing",
      "isActive": true
    },
    {
      "kind": "subtitles",
      "language": "es",
      "label": "Spanish",
      "mode": "disabled",
      "isActive": false
    }
  ],
  "message": "Found 2 caption tracks"
}
```

### Current Caption Response
```json
{
  "success": true,
  "text": "Hello, this is the current caption text.",
  "startTime": 125.5,
  "endTime": 128.0,
  "language": "en",
  "kind": "subtitles"
}
```

## Agent Integration Examples

### Natural Language Commands
Agents can use natural language that gets parsed automatically:

```javascript
// "Skip forward 30 seconds"
{ action: "seekForward", amount: 30 }

// "Go to the middle of the video"
{ action: "seek", time: "middle" }

// "Set volume to half"
{ action: "setVolume", time: "50" }

// "Play at 1.5x speed" 
{ action: "setPlaybackRate", time: "1.5" }

// "Jump to 2 minutes 30 seconds"
{ action: "seek", time: "2:30" }

// "Show available captions"
{ action: "getCaptions" }

// "Enable English subtitles"
{ action: "enableCaption", time: "en" }

// "Turn off captions"
{ action: "disableCaptions" }

// "Extract all caption text from this video"
{ action: "extractAllCaptions" }

// "What caption is shown at 2 minutes 30 seconds?"
{ action: "getCaptionText", time: "150" }
```

### Complex Workflows
```javascript
// Get video info first
{ action: "getInfo" }

// Seek to 25% through the video
{ action: "seek", time: "25%" }

// Speed up playback
{ action: "setPlaybackRate", time: "2.0" }

// Lower volume for background watching
{ action: "setVolume", time: "30" }

// Check what captions are available
{ action: "getCaptions" }

// Enable Spanish subtitles
{ action: "enableCaption", time: "es" }

// Extract complete video transcript (HTML5 only)
{ action: "extractAllCaptions" }

// Find what was said at exactly 3:45 into video
{ action: "getCaptionText", time: "225" }
```

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "No video player detected" | No video on page | Navigate to page with video first |
| "Unable to seek" | Video not loaded | Wait for video to load |
| "Netflix API not accessible" | Netflix protection | Falls back to HTML5 controls |
| "YouTube player not ready" | API not loaded | Retry after page fully loads |
| "No captions available" | No caption tracks | Check if video has captions |
| "Caption track not found" | Invalid language code | Use getCaptions to see available languages |
| "Caption text not accessible" | Platform limitations | Only HTML5 supports text extraction |

### Best Practices

1. **Check video info first** - Use `getInfo` to verify video is available
2. **Handle platform differences** - Some platforms have limitations
3. **Use relative seeking** - For unknown video lengths
4. **Provide fallbacks** - System automatically handles most cases

## Implementation Notes

### Platform-Specific Behaviors

- **YouTube**: Most reliable API, supports all features
- **Vimeo**: Full API support, async operations
- **Netflix**: Limited API access, frequent changes
- **HTML5**: Universal support, standard features
- **Custom Players**: Best-effort DOM manipulation

### Performance Considerations

- **Player Detection**: ~10ms for most sites
- **Seeking**: Platform-dependent (1-100ms)
- **HTML5 FastSeek**: Available in Firefox/Safari only

### Browser Compatibility

- **Chrome/Edge**: Full HTML5 support, no fastSeek
- **Firefox**: Full support including fastSeek
- **Safari**: Full support including fastSeek

## Troubleshooting

### Debug Information

Enable debug mode to see detailed platform detection:
```javascript
console.log('🔍 Detected player:', playerType);
console.log('📺 Video element:', videoElement);
console.log('🎮 API available:', !!playerAPI);
```

### Common Issues

1. **Video not detected**: Check if video is in iframe or shadow DOM
2. **Seek not working**: Verify video is loaded and seekable
3. **Platform API unavailable**: System falls back to HTML5
4. **Cross-origin restrictions**: Some embedded videos have limitations

## Caption Language Codes

Common language codes for caption control:

- `"en"` - English
- `"es"` - Spanish  
- `"fr"` - French
- `"de"` - German
- `"it"` - Italian
- `"pt"` - Portuguese
- `"ja"` - Japanese
- `"ko"` - Korean
- `"zh"` - Chinese
- `"ar"` - Arabic
- `"ru"` - Russian
- `"hi"` - Hindi

Use `getCaptions` to discover available languages for specific videos.

## Future Enhancements

- **Quality selection** - Change video resolution
- **Picture-in-picture** - Control PiP mode
- **Playlist navigation** - Next/previous video
- **Live stream support** - DVR controls for live content
- **Caption styling** - Control caption appearance
- **Multiple caption tracks** - Support for multiple simultaneous tracks

---

**Note**: This API is designed for legitimate automation and accessibility purposes. Always respect platform terms of service and user privacy.