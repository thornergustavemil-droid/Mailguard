'use strict';

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const accountStore = require('./account-store');
const { fetchMails, fetchMailBody, markRead, markAllRead, deleteMail, sendReply } = require('./imap-client');
const { getPresets } = require('./presets');
const { exportThread } = require('./mail-utils');
const adsStore = require('./ads-store');
const { scrapeAd, extractAdUrls, closeBrowser } = require('./ads-scraper');
const { startAutoRefresh, stopAutoRefresh } = require('./auto-refresh');

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0c0c0e',
        icon: path.join(__dirname, '../assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

// IPC Handlers
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('get-accounts', () => accountStore.getAll());
ipcMain.handle('add-account', (e, data) => accountStore.add(data));
ipcMain.handle('update-account', (e, id, data) => accountStore.update(id, data));
ipcMain.handle('delete-account', (e, id) => accountStore.remove(id));
ipcMain.handle('get-presets', () => getPresets());

ipcMain.handle('fetch-mails', (e, id) => fetchMails(id));
ipcMain.handle('fetch-mail-body', (e, id, folder, uid) => fetchMailBody(id, folder, uid));
ipcMain.handle('mark-read', (e, id, folder, uid) => markRead(id, folder, uid));
ipcMain.handle('mark-all-read', (e, id) => markAllRead(id));
ipcMain.handle('delete-mail', (e, id, folder, uid) => deleteMail(id, folder, uid));
ipcMain.handle('send-reply', (e, id, data) => sendReply(id, data));

ipcMain.handle('export-thread', (e, data) => exportThread(data));

// Ads Store
ipcMain.handle('ads-get-all', () => adsStore.getAll());
ipcMain.handle('ads-add-manual', (e, url) => adsStore.add(url));
ipcMain.handle('ads-remove', (e, id) => adsStore.remove(id));
ipcMain.handle('ads-remove-bulk', (e, ids) => adsStore.removeBulk(ids));
ipcMain.handle('ads-remove-duplicates', () => adsStore.removeDuplicates());
ipcMain.handle('ads-remove-offline', () => adsStore.removeOffline());
ipcMain.handle('ads-refresh-one', (e, id) => adsStore.refreshOne(id));
ipcMain.handle('ads-refresh-all', () => adsStore.refreshAll());
ipcMain.handle('ads-deep-scan', async () => {
    const accounts = await accountStore.getAll();
    return adsStore.deepScan(accounts, (progress) => {
        mainWindow.webContents.send('ads-deep-scan-progress', progress);
    });
});

// Settings & Refresh
ipcMain.handle('get-refresh', () => accountStore.getRefreshInterval());
ipcMain.handle('set-refresh', (e, interval) => {
    accountStore.setRefreshInterval(interval);
    if (interval > 0) startAutoRefresh(interval, mainWindow);
    else stopAutoRefresh();
});

// App Controls
ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('close', () => mainWindow.hide());

// Initialization
app.whenReady().then(() => {
    createWindow();
    
    // Tray setup
    tray = new Tray(path.join(__dirname, '../assets/icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Öffnen', click: () => mainWindow.show() },
        { type: 'separator' },
        { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setToolTip('Mailguard');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow.show());

    const interval = accountStore.getRefreshInterval();
    if (interval > 0) startAutoRefresh(interval, mainWindow);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    isQuitting = true;
    closeBrowser();
});
