---
title: Download
---

# Download

## MarkUP Desktop

Version 0.1.0 for Windows 10 and 11 (64-bit).

| Download | |
|---|---|
| **[MarkUP-Setup-x64.exe](downloads/MarkUP-Setup-x64.exe)** | Installer — recommended. Installs for your user account (no administrator rights), adds a Start menu entry and opens `.markup` and `.mkup` files. |
| [MarkUP-x64.msi](downloads/MarkUP-x64.msi) | Windows Installer package, installs for all users. For managed deployment. |
| [MarkUP-Portable-x64.exe](downloads/MarkUP-Portable-x64.exe) | Portable — no installation, run it from any folder. Does not register file types. |

The installers set up the Microsoft Edge WebView2 runtime if it is missing. The portable app needs it already installed, which it is on Windows 11 and on up-to-date Windows 10.

:::warning[Windows SmartScreen]
The downloads are not code-signed yet, so Windows may show *Windows protected your PC*. Check the file against its checksum, then choose **More info → Run anyway**.
:::

Checksums: [SHA256SUMS.txt](downloads/SHA256SUMS.txt). In PowerShell:

```powershell
Get-FileHash .\MarkUP-Setup-x64.exe -Algorithm SHA256
```

Uninstall from *Settings → Apps → Installed apps*.

macOS and Linux builds are not packaged yet; [build the app from source](desktop.md#run-it) — it runs on both.

## VS Code extension

Version 0.2.0 of the `markup-lang` extension.

**[markup.vsix](downloads/markup.vsix)** — install it with *Extensions → … → Install from VSIX…*, or:

```sh
code --install-extension markup.vsix
```

Installing over an older version upgrades it. See [the extension guide](vscode.md) for its features and settings.

## Command line

The `markup` CLI is installed from the source repository; see [getting started](getting-started.md#install).
