# Privacy Policy — Deluge Remote Modern

**Last updated:** April 5, 2026

## Overview

Deluge Remote Modern is a browser extension that allows users to monitor and manage torrents on their own Deluge server. This extension is open source and available at [github.com/TSA3000/deluge-remote-modern](https://github.com/TSA3000/deluge-remote-modern).

## Data Collection

This extension does **not** collect, transmit, or share any personal data with the developer or any third party.

## Permissions & Transparency

In compliance with the Chrome Web Store "Narrowest Permissions" policy, this extension only requests:

- **`storage`**: To save your server settings locally.
- **`contextMenus`**: To allow adding torrents via right-click.
- **`host_permissions`**: To communicate solely with your configured Deluge Web UI.
- **Note:** As of v2.0.9, the `tabs` permission has been removed as it is not required for core functionality.

## Data Stored Locally

The following information is stored locally on your device using Chrome's `chrome.storage.sync` API:

- **Deluge server address** (protocol, IP, port, base path)
- **Deluge password** (Stored using **AES-256-GCM encryption**)
- **User preferences** — theme setting, link handling, and refresh intervals.

## Network Requests & Frequency

The extension only makes network requests to the Deluge Web UI server address that you configure.

- **Refresh Rate:** To provide real-time updates, the extension polls your local Deluge server every **3 seconds** while the popup is open. No data is ever sent to external analytics or third-party servers.

## Authentication

The extension stores your Deluge Web UI password using AES-256-GCM encryption. The encryption key is generated per-installation and stored locally on your device.

## Open Source

You can review the complete source code at:
[github.com/TSA3000/deluge-remote-modern](https://github.com/TSA3000/deluge-remote-modern)

## Contact

If you have questions, please open an issue on the [GitHub repository](https://github.com/TSA3000/deluge-remote-modern/issues)
