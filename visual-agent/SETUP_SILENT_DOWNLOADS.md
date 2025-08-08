# Setup Guide: Enable Silent Screenshot Downloads

## Problem
By default, Chrome shows a "Save As" dialog for every download, including screenshots from the Visual Agent extension. This prevents automatic screenshot saving.

## Solution
To enable automatic (silent) screenshot downloads, you need to change one Chrome setting:

### Steps:

1. **Open Chrome Settings**
   - Type `chrome://settings/` in the address bar, or
   - Click Chrome menu (⋮) → Settings

2. **Navigate to Downloads**
   - Click "Advanced" in the left sidebar
   - Click "Downloads"

3. **Disable the Save Dialog**
   - Find the setting: **"Ask where to save each file before downloading"**
   - Turn this setting **OFF** (toggle should be gray/disabled)

4. **Test the Extension**
   - Try taking a screenshot with the Visual Agent
   - Screenshots should now save automatically to: `~/Downloads/temp/visual-agent/`

## What This Does
- Screenshots will save automatically without prompting
- Files are organized in `Downloads/temp/visual-agent/` folder
- The Mac app receives the full file path immediately
- Screenshots appear in the Mac app interface instantly

## Important Notes
- This setting affects all downloads in Chrome, not just the extension
- If you prefer to keep the setting ON for other downloads, you can:
  - Use a separate Chrome profile just for the Visual Agent
  - Temporarily disable the setting when using the Visual Agent

## Troubleshooting
If screenshots still show save dialogs:
1. Check that the Chrome setting is actually OFF
2. Restart Chrome after changing the setting
3. Check the browser console (F12) for any error messages
4. Ensure the extension has "downloads" permission

---

**Alternative:** If you don't want to change the global Chrome setting, the extension will still work but you'll need to manually choose where to save each screenshot.