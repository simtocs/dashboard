// ============ AUTH SYSTEM ============
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

function getAuthData() {
    try {
        const authString = getCookie('userAuth');
        if (!authString) return null;
        return JSON.parse(atob(authString));
    } catch (e) {
        console.error('Auth parse error:', e);
        return null;
    }
}

function checkAuth() {
    const authData = getAuthData();
    if (!authData) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return false;
    }

    if (authData.expiresAt && new Date() > new Date(authData.expiresAt)) {
        deleteCookie('userAuth');
        window.location.href = 'login.html?message=' + encodeURIComponent('Session expired');
        return false;
    }

    updateUIBasedOnRole(authData.role);
    return authData;
}

// ============ AUTO-LOGOUT INACTIVITY TIMER ============
let inactivityTimer;
let warningTimer;
let countdownInterval;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
const WARNING_TIME = 60 * 1000; // Show warning 60 seconds before logout

function startInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    
    // Hide warning if shown
    const warningElement = document.getElementById('logoutWarning');
    if (warningElement) {
        warningElement.classList.remove('show');
    }
    
    // Set warning timer (4 minutes)
    warningTimer = setTimeout(() => {
        showLogoutWarning();
    }, INACTIVITY_LIMIT - WARNING_TIME);
    
    // Set logout timer (5 minutes)
    inactivityTimer = setTimeout(() => {
        logout('Anda telah logout otomatis karena tidak ada aktivitas selama 5 menit');
    }, INACTIVITY_LIMIT);
}

function showLogoutWarning() {
    const warningElement = document.getElementById('logoutWarning');
    const countdownElement = document.getElementById('warningCountdown');
    
    if (!warningElement || !countdownElement) return;
    
    warningElement.classList.add('show');
    let countdown = 60;
    countdownElement.textContent = countdown;
    
    countdownInterval = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
}

function resetInactivityTimer() {
    startInactivityTimer();
}

// Listen for user activity
const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
activityEvents.forEach(event => {
    document.addEventListener(event, resetInactivityTimer, true);
});

// Start timer when page loads
window.addEventListener('DOMContentLoaded', () => {
    startInactivityTimer();
});

function updateUIBasedOnRole(role) {
    const authBtn = document.getElementById('authBtn');
    const isAdmin = role && role.toLowerCase() === 'admin';
    
    if (authBtn) {
        authBtn.style.display = isAdmin ? 'flex' : 'none';
    }
}

function logout(message = null) {
    if (!message && !confirm('Yakin ingin logout?')) return;
    
    accessToken = null;
    clearStoredToken();
    if (typeof gapi !== 'undefined' && gapi.client) {
        gapi.client.setToken(null);
    }
    updateAuthButton(false);
    
    deleteCookie('userAuth');
    window.location.href = 'login.html' + (message ? '?message=' + encodeURIComponent(message) : '');
}

let currentUserRole = null;

if (checkAuth()) {
    const authData = getAuthData();
    if (authData?.username) {
        const usernameElement = document.getElementById('displayUsername');
        if (usernameElement) {
            usernameElement.textContent = authData.username;
        }
    }
    if (authData?.role) {
        currentUserRole = authData.role;
        updateUIBasedOnRole(authData.role);
    }
}

// ============ CONFIG ============
const CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SPREADSHEET_ID: '1kOKzSSAYlXG33LokTmwRLpzFG-wYlAWUDCjEYvzKKNA',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    CACHE_DURATION: 5 * 60 * 1000,
    STORE_FOLDERS: {
        'F4SD - Indomaret SPBU Teras Ayung': '1l-jJd8dNJVYhwUXaxWBmzKKbWX3Xa2Yl',
        'FKOM - Indomaret Wanagiri': '18AafBvDTFXXEXDKJQ8ZYfuX2tbCs9huV',
        'FHEN - Indomaret SPBU Cempaga': '1K_F60Geylo2kqK3NCNiiVGBN981pBH2K',
        'FEHU - Indomaret SPBU Latusari 2 Mambal': '17FWdHTTkFmmmfWaG6xoKeAQnPwRbGvmp',
        'FIVI - Indomaret Toko Anugrah Ketapang': '1HGEqDAeKLUzIEpLbP1t5Op_UcfCPCU1R',
        'FZ7Y - Indomaret Pemuda 28 Mataram': '1VQsrHH9WeBVbTUj9f9OKcuBcKWQLMUAh',
        '1SFY - Alfamart SPBU Mantang': '1CtVrHqICW2EeIGtbEtPmqCnpF7618FW9',
        'Q789 - Alfamart SPBU Dewi Anom Rendang': '1x2__YhRwjPXbEHaAPOrVO0lLUCxkVUEH'
    }
};

// ============ OAUTH STATE ============
let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

// ============ STATE MANAGEMENT ============
let appState = {
    sheets: [],
    currentSheet: null,
    cache: {},
    lastUpdate: null,
    currentData: [],
    hasChanges: false
};

// ============ OAUTH INITIALIZATION ============
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: CONFIG.API_KEY,
            discoveryDocs: [
                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
            ]
        });
        gapiInited = true;
        maybeEnableButtons();
        console.log('GAPI client initialized with Drive support');
    } catch (error) {
        console.error('Error initializing GAPI client:', error);
    }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        prompt: '',
        callback: ''
    });
    gisInited = true;
    maybeEnableButtons();
    console.log('GIS initialized');
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        if (restoreStoredToken()) {
            console.log('Restored OAuth token from storage');
        }
        loadSheetsList();
    }
}

// ============ TOKEN STORAGE ============
function storeOAuthToken(token, expiresIn = 3600) {
    try {
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('oauth_token', token);
        localStorage.setItem('oauth_expiry', expiryTime.toString());
        console.log('OAuth token stored');
    } catch (e) {
        console.warn('Could not store OAuth token:', e);
    }
}

function restoreStoredToken() {
    try {
        const storedToken = localStorage.getItem('oauth_token');
        const expiry = localStorage.getItem('oauth_expiry');
        
        if (!storedToken || !expiry) {
            return false;
        }
        
        const expiryTime = parseInt(expiry);
        const now = Date.now();
        
        if (now < expiryTime - 300000) {
            accessToken = storedToken;
            gapi.client.setToken({ access_token: storedToken });
            updateAuthButton(true);
            console.log('Using stored OAuth token');
            return true;
        } else {
            clearStoredToken();
            console.log('Stored token expired');
            return false;
        }
    } catch (e) {
        console.warn('Error restoring token:', e);
        return false;
    }
}

function clearStoredToken() {
    try {
        localStorage.removeItem('oauth_token');
        localStorage.removeItem('oauth_expiry');
    } catch (e) {
        console.warn('Error clearing token:', e);
    }
}

function handleAuth() {
    if (accessToken) {
        accessToken = null;
        clearStoredToken();
        gapi.client.setToken(null);
        updateAuthButton(false);
    }

    tokenClient.callback = async (response) => {
        if (response.error !== undefined) {
            console.error('Auth error:', response);
            alert('Gagal authenticate: ' + response.error);
            clearStoredToken();
            return;
        }
        
        accessToken = response.access_token;
        const expiresIn = response.expires_in || 3600;
        storeOAuthToken(accessToken, expiresIn);
        gapi.client.setToken({ access_token: accessToken });
        
        updateAuthButton(true);
        if (appState.currentSheet) {
            loadSheetData(appState.currentSheet, true);
        }
        alert('✅ Berhasil authenticate dengan akses Drive!');
    };

    tokenClient.requestAccessToken({prompt: 'consent'});
}

function updateAuthButton(isAuthenticated) {
    const authBtn = document.getElementById('authBtn');
    const authBtnText = document.getElementById('authBtnText');
    const saveBtn = document.getElementById('saveBtn');
    
    if (authBtn && authBtnText) {
        if (isAuthenticated) {
            authBtn.classList.add('authenticated');
            authBtnText.textContent = '✓ Terotentikasi';
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        } else {
            authBtn.classList.remove('authenticated');
            authBtnText.textContent = 'Authenticate';
            if (saveBtn) saveBtn.style.display = 'none';
        }
    }
}

// ============ UTILITY FUNCTIONS ============
function showLoading(message = 'Memuat data...') {
    document.getElementById('content').innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">${message}</div>
        </div>
    `;
}

function showError(title, message) {
    document.getElementById('content').innerHTML = `
        <div class="error">
            <strong>❌ ${title}</strong>
            ${message}
        </div>
    `;
}

function showEmptyState() {
    document.getElementById('content').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h2>Pilih Toko untuk Melihat Data</h2>
            <p>Gunakan dropdown di atas untuk memilih toko yang ingin ditampilkan</p>
        </div>
    `;
    const ratingSection = document.getElementById('ratingSection');
    if (ratingSection) {
        ratingSection.style.display = 'none';
    }
}

function markAsChanged() {
    appState.hasChanges = true;
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn && accessToken) {
        saveBtn.style.display = 'inline-flex';
        saveBtn.disabled = false;
    }
}

// ============ CACHE MANAGEMENT ============
function getCachedData(sheetName) {
    const cached = appState.cache[sheetName];
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > CONFIG.CACHE_DURATION) {
        delete appState.cache[sheetName];
        return null;
    }
    
    return cached.data;
}

function setCachedData(sheetName, data) {
    appState.cache[sheetName] = {
        data: data,
        timestamp: Date.now()
    };
}

// ============ API FUNCTIONS ============
async function loadSheetsList() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        appState.sheets = data.sheets.map(sheet => sheet.properties.title);
        
        const sheetSelect = document.getElementById('sheetSelect');
        if (sheetSelect) {
            sheetSelect.innerHTML = '<option value="">Pilih Toko...</option>' + 
                appState.sheets.map(name => 
                    `<option value="${name}">${name}</option>`
                ).join('');
        }
        
        showEmptyState();
        
    } catch (error) {
        console.error('Error loading sheets:', error);
        showError('Gagal Memuat Daftar Toko', `
            ${error.message}
            <br><br>
            <strong>Pastikan:</strong>
            <ul style="margin-top: 10px; margin-left: 20px;">
                <li>Database ID benar</li>
                <li>API Key valid</li>
                <li>Google API sudah enabled</li>
            </ul>
        `);
    }
}

async function loadSheetData(sheetName, forceRefresh = false) {
    if (!sheetName) {
        showEmptyState();
        return;
    }

    if (!forceRefresh) {
        const cached = getCachedData(sheetName);
        if (cached) {
            console.log('Using cached data for:', sheetName);
            displayData(cached, sheetName);
            return;
        }
    }
    
    showLoading(`Memuat data: ${sheetName}`);
    appState.currentSheet = sheetName;
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        if (!data.values || data.values.length === 0) {
            showError('Data Kosong', `Tidak ada data di sheet "${sheetName}"`);
            return;
        }
        
        setCachedData(sheetName, data.values);
        appState.lastUpdate = new Date();
        appState.currentData = data.values;
        appState.hasChanges = false;
        
        displayData(data.values, sheetName);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Gagal Memuat Data', `
            ${error.message}
            <br><br>
            <strong>Sheet:</strong> "${sheetName}"
        `);
    }
}

// ============ AUTO SCORE FUNCTIONS ============
function calculateAutoScore() {
    if (!appState.currentData || appState.currentData.length < 2) {
        return null;
    }

    const headers = appState.currentData[0];
    const dataRows = appState.currentData.slice(1);
    
    let statusColIndex = -1;
    headers.forEach((header, idx) => {
        if (header && header.toLowerCase().includes('status')) {
            statusColIndex = idx;
        }
    });
    
    if (statusColIndex === -1) {
        return null;
    }
    
    let totalItems = 0;
    let yesCount = 0;
    let noCount = 0;
    let categoryStats = {};
    let currentCategory = '';
    
    dataRows.forEach(row => {
        const firstCell = (row[0] || '').trim();
        const isSectionHeader = /^[IVX]+\.\s+/.test(firstCell);
        
        if (isSectionHeader) {
            currentCategory = firstCell;
            if (!categoryStats[currentCategory]) {
                categoryStats[currentCategory] = { yes: 0, no: 0, total: 0 };
            }
        } else if (firstCell) {
            const status = (row[statusColIndex] || '').toLowerCase().trim();
            if (status === 'ya') {
                yesCount++;
                totalItems++;
                if (currentCategory && categoryStats[currentCategory]) {
                    categoryStats[currentCategory].yes++;
                    categoryStats[currentCategory].total++;
                }
            } else if (status === 'tidak') {
                noCount++;
                totalItems++;
                if (currentCategory && categoryStats[currentCategory]) {
                    categoryStats[currentCategory].no++;
                    categoryStats[currentCategory].total++;
                }
            }
        }
    });
    
    if (totalItems === 0) {
        return null;
    }
    
    const score = (yesCount / totalItems) * 5;
    const percentage = (yesCount / totalItems) * 100;
    
    return {
        score: score.toFixed(1),
        yesCount: yesCount,
        noCount: noCount,
        totalItems: totalItems,
        percentage: percentage.toFixed(1),
        categoryStats: categoryStats
    };
}

// Helper function to get signature data from sheet (only right signature)
function getSignatureData() {
    let title = 'Diketahui Oleh';
    let name = '';
    
    // Row 33 (index 32) = Manager Carang Sari Group
    if (appState.currentData && appState.currentData.length > 32) {
        const row33 = appState.currentData[32]; // A33, B33
        
        if (row33 && row33.length >= 2) {
            title = row33[0] || title;  // A33: Manager Carang Sari Group
            name = row33[1] || '';       // B33: Nama Manager
        }
    }
    
    return { title, name };
}

function updateAutoScore() {
    const scoreData = calculateAutoScore();
    const scoreInput = document.getElementById('storeRating');
    const autoScoreDisplay = document.getElementById('autoScoreDisplay');
    
    if (scoreData && scoreInput) {
        scoreInput.value = scoreData.score;
        
        let statusColor = '#28a745';
        if (scoreData.percentage < 60) {
            statusColor = '#dc3545';
        } else if (scoreData.percentage < 75) {
            statusColor = '#ffc107';
        }
        
        if (autoScoreDisplay) {
            autoScoreDisplay.innerHTML = `
                <div style="margin-top: 10px; padding: 12px; background: #e8f5e9; border-left: 4px solid ${statusColor}; border-radius: 4px;">
                    <strong>📊 Statistik Pemeriksaan:</strong><br>
                    <div style="display: flex; gap: 15px; margin-top: 8px; flex-wrap: wrap;">
                        <span>✅ Ya: <strong>${scoreData.yesCount}</strong></span>
                        <span>❌ Tidak: <strong>${scoreData.noCount}</strong></span>
                        <span>📋 Total: <strong>${scoreData.totalItems}</strong></span>
                    </div>
                    <div style="margin-top: 8px; font-size: 16px;">
                        <strong style="color: ${statusColor};">Tingkat Kepatuhan: ${scoreData.percentage}%</strong>
                    </div>
                </div>
            `;
        }
    }
}

function showNotificationBanner(message, type = 'info') {
    const banner = document.createElement('div');
    const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
    
    banner.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 9999;
        font-weight: 600;
        animation: slideInRight 0.3s ease-out;
    `;
    banner.textContent = message;
    document.body.appendChild(banner);
    
    setTimeout(() => {
        banner.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => banner.remove(), 300);
    }, 3000);
}

// ============ DISPLAY FUNCTIONS ============
function displayData(values, sheetName) {
    if (values.length < 2) {
        showError('Format Data Salah', 'Sheet harus memiliki minimal 2 baris (header dan data)');
        return;
    }

    const headers = values[0] || [];
    
    let html = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
    `;

    headers.forEach((header, idx) => {
        html += `<th>${header || `Kolom ${idx + 1}`}</th>`;
    });
    
    html += `
                    </tr>
                </thead>
                <tbody>
    `;

    for (let rowIdx = 1; rowIdx < values.length; rowIdx++) {
        const row = values[rowIdx] || [];
        // Skip rows 32 and 33 (index 31 and 32) - signature data
        if (rowIdx === 31 || rowIdx === 32) {
            continue;
        }
        
        html += `<tr>`;
        
        const firstCell = (row[0] || '').trim();
        const isSectionHeader = /^[IVX]+\.\s+[A-Z]/.test(firstCell);
        
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const cellValue = row[colIdx] || '';
            const header = headers[colIdx] || '';
            
            if (isSectionHeader && (header.toLowerCase().includes('status') || header.toLowerCase().includes('keterangan'))) {
                html += `<td style="background: #f8f9fa;"></td>`;
            }
            else if (header.toLowerCase().includes('status')) {
                const isAdmin = currentUserRole && currentUserRole.toLowerCase() === 'admin';
                
                if (isAdmin) {
                    html += `<td class="editable status-cell">
                        <div class="status-buttons">
                            <button class="status-btn ya ${cellValue === 'Ya' ? 'active' : ''}" 
                                    onclick="setStatus(${rowIdx}, ${colIdx}, 'Ya')" 
                                    data-row="${rowIdx}" data-col="${colIdx}">Ya</button>
                            <button class="status-btn tidak ${cellValue === 'Tidak' ? 'active' : ''}" 
                                    onclick="setStatus(${rowIdx}, ${colIdx}, 'Tidak')" 
                                    data-row="${rowIdx}" data-col="${colIdx}">Tidak</button>
                        </div>
                    </td>`;
                } else {
                    html += `<td class="status-cell" style="text-align: center; font-weight: 600; color: ${cellValue === 'Ya' ? '#28a745' : cellValue === 'Tidak' ? '#dc3545' : '#6c757d'};">
                        ${cellValue || '-'}
                    </td>`;
                }
            }
            else if (header.toLowerCase().includes('keterangan')) {
                const isAdmin = currentUserRole && currentUserRole.toLowerCase() === 'admin';
                
                if (isAdmin) {
                    html += `<td class="editable">
                        <input type="text" 
                               class="keterangan-input" 
                               value="${cellValue}" 
                               data-row="${rowIdx}" data-col="${colIdx}"
                               onchange="updateKeterangan(${rowIdx}, ${colIdx}, this.value)"
                               placeholder="Masukkan keterangan...">
                    </td>`;
                } else {
                    html += `<td>${cellValue || '-'}</td>`;
                }
            }
            else if (header.toLowerCase().includes('foto') || header.toLowerCase().includes('photo') || header.toLowerCase().includes('gambar')) {
                const isAdmin = currentUserRole && currentUserRole.toLowerCase() === 'admin';
                
                if (isAdmin) {
                    html += `<td class="editable">
                        <div class="upload-buttons-group">
                            <button class="camera-btn" onclick="openCamera(${rowIdx}, ${colIdx})">
                                📷 Ambil Foto
                            </button>
                            <button class="upload-btn" onclick="openImageUpload(${rowIdx}, ${colIdx})">
                                🖼️ Upload Foto
                            </button>
                        </div>`;
                    
                    if (cellValue) {
                        const imageUrls = cellValue.split(',').map(url => url.trim()).filter(url => url);
                        if (imageUrls.length > 0) {
                            html += `<div class="image-preview-container">`;
                            imageUrls.forEach((url, imgIdx) => {
                                const fileId = url.match(/[-\w]{25,}/);
                                if (fileId) {
                                    html += `
                                        <div style="position: relative; display: inline-block;">
                                            <a href="${url}" target="_blank">
                                                <img src="https://drive.google.com/thumbnail?id=${fileId[0]}&sz=w200" 
                                                     class="image-preview" 
                                                     alt="Foto"
                                                     onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                                            </a>
                                            <button class="delete-image-btn" 
                                                    onclick="event.preventDefault(); deleteImage(${rowIdx}, ${colIdx}, ${imgIdx}, '${fileId[0]}');"
                                                    title="Hapus foto">
                                                ✕
                                            </button>
                                        </div>`;
                                }
                            });
                            html += `</div>`;
                        }
                    }
                    
                    html += `</td>`;
                } else {
                    html += `<td>`;
                    if (cellValue) {
                        const imageUrls = cellValue.split(',').map(url => url.trim()).filter(url => url);
                        if (imageUrls.length > 0) {
                            html += `<div class="image-preview-container">`;
                            imageUrls.forEach(url => {
                                const fileId = url.match(/[-\w]{25,}/);
                                if (fileId) {
                                    html += `<a href="${url}" target="_blank">
                                        <img src="https://drive.google.com/thumbnail?id=${fileId[0]}&sz=w200" 
                                             class="image-preview" 
                                             alt="Foto"
                                             onerror="this.src='https://via.placeholder.com/80?text=No+Image'">
                                    </a>`;
                                }
                            });
                            html += `</div>`;
                        } else {
                            html += '-';
                        }
                    } else {
                        html += '-';
                    }
                    html += `</td>`;
                }
            }
            else if (colIdx === 0) {
                html += `<td class="row-label">${cellValue}</td>`;
            }
            else {
                html += `<td>${cellValue}</td>`;
            }
        }
        
        html += `</tr>`;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;
    
    document.getElementById('content').innerHTML = html;
    
    const ratingSection = document.getElementById('ratingSection');
    if (ratingSection) {
        ratingSection.style.display = 'block';
    }
    
    setTimeout(() => {
        updateAutoScore();
    }, 100);
}

// ============ EDIT FUNCTIONS ============
function setStatus(rowIdx, colIdx, status) {
    if (!appState.currentData[rowIdx]) {
        appState.currentData[rowIdx] = [];
    }
    
    const currentValue = appState.currentData[rowIdx][colIdx];
    if (currentValue === status) {
        appState.currentData[rowIdx][colIdx] = '';
        status = '';
    } else {
        appState.currentData[rowIdx][colIdx] = status;
    }
    
    markAsChanged();
    
    const buttons = document.querySelectorAll(`[data-row="${rowIdx}"][data-col="${colIdx}"]`);
    buttons.forEach(btn => {
        if (btn.classList.contains('status-btn')) {
            btn.classList.remove('active');
            if (status !== '' && ((status === 'Ya' && btn.classList.contains('ya')) || 
                (status === 'Tidak' && btn.classList.contains('tidak')))) {
                btn.classList.add('active');
            }
        }
    });
}

function updateKeterangan(rowIdx, colIdx, value) {
    if (!appState.currentData[rowIdx]) {
        appState.currentData[rowIdx] = [];
    }
    appState.currentData[rowIdx][colIdx] = value;
    markAsChanged();
}

// ============ CRUD FUNCTIONS ============
async function handleSaveAll() {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }

    if (!appState.hasChanges) {
        alert('Tidak ada perubahan untuk disimpan.');
        return;
    }

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>⏳</span><span>Menyimpan...</span>';
    }

    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${appState.currentSheet}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: appState.currentData
            }
        });

        appState.hasChanges = false;
        
        if (saveBtn) {
            saveBtn.innerHTML = '<span>✓</span><span>Tersimpan</span>';
            
            setTimeout(() => {
                saveBtn.innerHTML = '<span>💾</span><span>Simpan Semua</span>';
                saveBtn.disabled = false;
            }, 2000);
        }

        delete appState.cache[appState.currentSheet];
        await loadSheetData(appState.currentSheet, true);
        
        alert('✅ Semua perubahan berhasil disimpan!');
        
        setTimeout(() => {
            updateAutoScore();
        }, 500);
        
    } catch (error) {
        console.error('Error saving data:', error);
        alert('❌ Gagal menyimpan data: ' + error.message);
        if (saveBtn) {
            saveBtn.innerHTML = '<span>💾</span><span>Simpan Semua</span>';
            saveBtn.disabled = false;
        }
    }
}

async function addColumn(rowData) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }

    try {
        appState.currentData.push(rowData);

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${appState.currentSheet}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: appState.currentData
            }
        });

        delete appState.cache[appState.currentSheet];
        await loadSheetData(appState.currentSheet, true);
        
        alert('✅ Baris baru berhasil ditambahkan!');
    } catch (error) {
        console.error('Error adding row:', error);
        alert('❌ Gagal menambahkan baris: ' + error.message);
        throw error;
    }
}

async function deleteColumn(colIdx) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }

    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });
        
        const sheet = spreadsheet.result.sheets.find(
            s => s.properties.title === appState.currentSheet
        );
        
        if (!sheet) {
            throw new Error('Sheet not found');
        }
        
        const sheetId = sheet.properties.sheetId;
        
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'COLUMNS',
                            startIndex: colIdx,
                            endIndex: colIdx + 1
                        }
                    }
                }]
            }
        });

        delete appState.cache[appState.currentSheet];
        await loadSheetData(appState.currentSheet, true);
        
        alert('✅ Kolom berhasil dihapus!');
    } catch (error) {
        console.error('Error deleting column:', error);
        alert('❌ Gagal menghapus kolom: ' + error.message);
        throw error;
    }
}

// ============ IMAGE UPLOAD FUNCTIONS ============
function getCurrentStoreFolderId() {
    if (!appState.currentSheet) {
        throw new Error('No store sheet selected');
    }
    
    const folderId = CONFIG.STORE_FOLDERS[appState.currentSheet];
    if (!folderId || folderId.startsWith('FOLDER_ID_')) {
        throw new Error(`Folder belum dikonfigurasi untuk toko: ${appState.currentSheet}`);
    }
    
    return folderId;
}

async function uploadMultipleImages(files, rowIdx, colIdx) {
    const totalFiles = files.length;
    const uploadedLinks = [];
    
    const uploadBtn = document.querySelector(`button[onclick="openImageUpload(${rowIdx}, ${colIdx})"]`);
    const cameraBtn = document.querySelector(`button[onclick="openCamera(${rowIdx}, ${colIdx})"]`);
    
    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            if (uploadBtn) {
                uploadBtn.disabled = true;
                uploadBtn.innerHTML = `⏳ Uploading ${i + 1}/${totalFiles}...`;
            }
            if (cameraBtn) {
                cameraBtn.disabled = true;
            }
            
            const link = await uploadSingleImageToDrive(file, rowIdx, colIdx, i, totalFiles);
            if (link) {
                uploadedLinks.push(link);
            }
        }
        
        if (uploadedLinks.length > 0) {
            if (!appState.currentData[rowIdx]) {
                appState.currentData[rowIdx] = [];
            }
            
            const existingValue = appState.currentData[rowIdx][colIdx] || '';
            const existingLinks = existingValue ? existingValue.split(',').map(s => s.trim()).filter(s => s) : [];
            const allLinks = [...existingLinks, ...uploadedLinks];
            appState.currentData[rowIdx][colIdx] = allLinks.join(', ');
            
            if (uploadBtn) {
                uploadBtn.innerHTML = '💾 Menyimpan...';
            }
            
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                range: `${appState.currentSheet}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: appState.currentData
                }
            });

            appState.hasChanges = false;
            delete appState.cache[appState.currentSheet];
            
            alert(`✅ ${uploadedLinks.length} foto berhasil diupload dan disimpan!`);
            await loadSheetData(appState.currentSheet, true);
        }
        
    } catch (error) {
        console.error('Error in batch upload:', error);
        alert('❌ Error saat upload: ' + error.message);
    } finally {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '🖼️ Upload Foto';
        }
        if (cameraBtn) {
            cameraBtn.disabled = false;
        }
    }
}

async function uploadSingleImageToDrive(file, rowIdx, colIdx, currentIndex, totalFiles) {
    const folderId = getCurrentStoreFolderId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storeName = appState.currentSheet.split(' - ')[0];
    const metadata = {
        name: `${storeName}_row${rowIdx}_${timestamp}_${currentIndex}.${file.name.split('.').pop()}`,
        parents: [folderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
        body: form
    });

    const result = await response.json();

    if (result.error) {
        throw new Error(result.error.message);
    }

    await gapi.client.drive.permissions.create({
        fileId: result.id,
        resource: {
            type: 'anyone',
            role: 'reader'
        }
    });

    return result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
}

async function deleteImage(rowIdx, colIdx, imgIdx, fileId) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }
    
    if (!confirm('⚠️ Yakin ingin menghapus foto ini?\n\nFoto akan dihapus dari Google Drive dan tidak dapat dikembalikan!')) {
        return;
    }

    const deleteBtn = event ? event.target : null;
    
    try {
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '⏳';
        }

        try {
            await gapi.client.drive.files.delete({
                fileId: fileId
            });
            console.log('File deleted from Drive:', fileId);
        } catch (driveError) {
            console.warn('Could not delete file from Drive (might already be deleted):', driveError);
        }

        if (!appState.currentData[rowIdx]) {
            appState.currentData[rowIdx] = [];
        }
        
        const existingValue = appState.currentData[rowIdx][colIdx] || '';
        const existingLinks = existingValue.split(',').map(s => s.trim()).filter(s => s);
        
        existingLinks.splice(imgIdx, 1);
        
        appState.currentData[rowIdx][colIdx] = existingLinks.join(', ');
        
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${appState.currentSheet}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: appState.currentData
            }
        });

        appState.hasChanges = false;
        delete appState.cache[appState.currentSheet];
        
        alert('✅ Foto berhasil dihapus!');
        await loadSheetData(appState.currentSheet, true);
        
    } catch (error) {
        console.error('Error deleting image:', error);
        alert('❌ Gagal menghapus foto: ' + error.message);
        
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '✕';
        }
    }
}

function openCamera(rowIdx, colIdx) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu untuk ambil foto!');
        return;
    }
    
    try {
        getCurrentStoreFolderId();
    } catch (error) {
        alert('❌ ' + error.message + '\n\nSilakan hubungi admin untuk konfigurasi folder.');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = false;

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                alert('❌ File terlalu besar! Maksimal 10MB');
                return;
            }
            
            if (!file.type.startsWith('image/')) {
                alert('❌ File harus berupa gambar!');
                return;
            }
            
            await uploadMultipleImages([file], rowIdx, colIdx);
        }
    };

    input.click();
}

function openImageUpload(rowIdx, colIdx) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu untuk upload foto!');
        return;
    }
    
    try {
        getCurrentStoreFolderId();
    } catch (error) {
        alert('❌ ' + error.message + '\n\nSilakan hubungi admin untuk konfigurasi folder.');
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;

    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            for (const file of files) {
                if (file.size > 10 * 1024 * 1024) {
                    alert(`❌ File "${file.name}" terlalu besar! Maksimal 10MB per file`);
                    return;
                }
                
                if (!file.type.startsWith('image/')) {
                    alert(`❌ File "${file.name}" harus berupa gambar!`);
                    return;
                }
            }
            
            await uploadMultipleImages(files, rowIdx, colIdx);
        }
    };

    input.click();
}

// ============ PRINT REPORT FUNCTIONS ============
function generatePrintReport() {
    if (!appState.currentSheet || !appState.currentData || appState.currentData.length < 2) {
        alert('⚠️ Tidak ada data untuk dicetak!');
        return;
    }

    const storeRating = document.getElementById('storeRating') ? document.getElementById('storeRating').value : '';
    const storeComment = document.getElementById('storeComment') ? document.getElementById('storeComment').value : '';

    const storeName = appState.currentSheet;
    const currentDate = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const headers = appState.currentData[0];
    const dataRows = appState.currentData.slice(1);
    const signatureData = getSignatureData();
    
    let printHTML = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laporan Checklist - ${storeName}</title>
    <style>
        @page {
            size: A4;
            margin: 15mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #000;
        }
        
        .header-section {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
        }
        
        .header-section h1 {
            font-size: 16pt;
            margin-bottom: 5px;
        }
        
        .header-section .store-name {
            font-size: 14pt;
            font-weight: bold;
            margin: 5px 0;
        }
        
        .header-section .date {
            font-size: 10pt;
            margin-top: 5px;
        }
        
        .section-title {
            font-weight: bold;
            font-size: 12pt;
            margin: 15px 0 10px 0;
            padding: 5px;
            background: #f0f0f0;
            border-left: 4px solid #2E7D32;
        }
        
        .checklist-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        .checklist-table th,
        .checklist-table td {
            border: 1px solid #000;
            padding: 8px;
            text-align: left;
            vertical-align: top;
        }
        
        .checklist-table th {
            background: #e0e0e0;
            font-weight: bold;
            text-align: center;
        }
        
        .checklist-table .item-column {
            width: 35%;
        }
        
        .checklist-table .status-column {
            width: 12%;
            text-align: center;
        }
        
        .checklist-table .notes-column {
            width: 28%;
        }
        
        .checklist-table .photo-column {
            width: 25%;
            text-align: center;
        }
        
        .status-baik {
            color: #2E7D32;
            font-weight: bold;
        }
        
        .status-kurang {
            color: #dc3545;
            font-weight: bold;
        }
        
        .photo-container {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            justify-content: center;
        }
        
        .photo-container img {
            max-width: 100px;
            max-height: 100px;
            border: 1px solid #ccc;
            border-radius: 4px;
            object-fit: cover;
        }
        
        .no-photo {
            font-size: 9pt;
            color: #999;
            font-style: italic;
        }
        
        .footer-section {
            margin-top: 30px;
            page-break-inside: avoid;
        }
        
        .scoring-section {
            background: #f9f9f9;
            padding: 15px;
            border: 2px solid #2E7D32;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        
        .scoring-section h3 {
            color: #2E7D32;
            margin-bottom: 15px;
            border-bottom: 2px solid #2E7D32;
            padding-bottom: 5px;
        }
        
        .score-display {
            margin-bottom: 15px;
        }
        
        .score-display label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
        }
        
        .score-value {
            font-size: 24pt;
            font-weight: bold;
            color: #2E7D32;
            display: inline-block;
            padding: 10px 20px;
            background: white;
            border: 2px solid #2E7D32;
            border-radius: 8px;
        }
        
        .comment-display {
            margin-bottom: 15px;
        }
        
        .comment-display label {
            font-weight: bold;
            display: block;
            margin-bottom: 8px;
        }
        
        .comment-text {
            padding: 12px;
            background: white;
            border: 2px solid #dee2e6;
            border-radius: 6px;
            min-height: 60px;
            white-space: pre-wrap;
            line-height: 1.6;
        }
        
        .signature-area {
            margin-top: 20px;
            display: flex;
            justify-content: center;
        }
        
        .signature-box {
            width: 45%;
            text-align: center;
        }
        
        .signature-box .title {
            font-weight: bold;
            margin-bottom: 60px;
        }
        
        .signature-box .name {
            border-top: 1px solid #000;
            padding-top: 5px;
            display: inline-block;
            min-width: 150px;
        }
        
        .empty-rating {
            color: #dc3545;
            font-style: italic;
        }
        
        @media print {
            body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }
            
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="header-section">
        <h1>LAPORAN CHECKLIST PEMERIKSAAN TOKO</h1>
        <div class="store-name">Kode Toko – Nama Toko: ${storeName}</div>
        <div class="date">Tanggal Pengecekan: ${currentDate}</div>
    </div>
`;

    let currentSection = '';
    let sectionData = [];
    
    dataRows.forEach(row => {
        const firstCell = (row[0] || '').trim();
        const isSectionHeader = /^[IVX]+\.\s+/.test(firstCell);
        
        if (isSectionHeader) {
            if (currentSection && sectionData.length > 0) {
                printHTML += generateSectionTable(currentSection, sectionData, headers);
                sectionData = [];
            }
            currentSection = firstCell;
        } else if (firstCell) {
            sectionData.push(row);
        }
    });
    
    if (currentSection && sectionData.length > 0) {
        printHTML += generateSectionTable(currentSection, sectionData, headers);
    }

    printHTML += `
    <div class="footer-section">
        <div class="scoring-section">
            <h3>PENILAIAN TOKO</h3>
            
            <div class="score-display">
                <label>Score Toko:</label>
                ${storeRating ? 
                    `<span class="score-value">${storeRating}</span> <span style="color: #666; margin-left: 10px;">/ 5.0</span>` 
                    : 
                    `<span class="empty-rating">Belum ada penilaian</span>`
                }
            </div>
            
            <div class="comment-display">
                <label>Komentar / Review Toko:</label>
                <div class="comment-text">
                    ${storeComment || '<span class="empty-rating">Belum ada komentar</span>'}
                </div>
            </div>
        </div>
        
        <div class="signature-area">
            <div class="signature-box">
                <div class="title">${signatureData.title},</div>
                <div class="name">(${signatureData.name || '_________________'})</div>
            </div>
        </div>
    </div>
</body>
</html>
`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(printHTML);
        printWindow.document.close();
        
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
            }, 500);
        };
    } else {
        alert('❌ Tidak dapat membuka window print. Pastikan popup tidak diblokir.');
    }
}

function generateSectionTable(sectionTitle, rows, headers) {
    let html = `
    <div class="section-title">${sectionTitle}</div>
    <table class="checklist-table">
        <thead>
            <tr>
                <th class="item-column">Item Pemeriksaan</th>
                <th class="status-column">Status</th>
                <th class="notes-column">Keterangan</th>
                <th class="photo-column">Dokumentasi</th>
            </tr>
        </thead>
        <tbody>
`;

    rows.forEach(row => {
        const item = row[1] || '-';
        const status = row[2] || '';
        const notes = row[3] || '-';
        const photos = row[4] || '';
        
        let statusText = '-';
        let statusClass = '';
        
        if (status) {
            const statusLower = status.toLowerCase().trim();
            if (statusLower === 'ya') {
                statusText = 'Ya';
                statusClass = 'status-baik';
            } else if (statusLower === 'tidak') {
                statusText = 'Tidak';
                statusClass = 'status-kurang';
            } else {
                statusText = status;
            }
        }
        
        let photoHTML = '';
        if (photos && photos.trim() !== '') {
            const imageUrls = photos.split(',').map(url => url.trim()).filter(url => url);
            
            if (imageUrls.length > 0) {
                photoHTML = '<div class="photo-container">';
                imageUrls.forEach(url => {
                    const fileIdMatch = url.match(/[-\w]{25,}/);
                    if (fileIdMatch) {
                        const fileId = fileIdMatch[0];
                        photoHTML += `<img src="https://drive.google.com/thumbnail?id=${fileId}&sz=w200" alt="Foto" onerror="this.style.display='none'">`;
                    }
                });
                photoHTML += '</div>';
            } else {
                photoHTML = '<span class="no-photo">Tidak ada foto</span>';
            }
        } else {
            photoHTML = '<span class="no-photo">Tidak ada foto</span>';
        }

        html += `
            <tr>
                <td>${item}</td>
                <td class="status-column ${statusClass}">${statusText}</td>
                <td>${notes}</td>
                <td class="photo-column">${photoHTML}</td>
            </tr>
        `;
    });

    html += `
        </tbody>
    </table>
`;

    return html;
}

// ============ EVENT HANDLERS ============
function handleSheetChange() {
    const sheetSelect = document.getElementById('sheetSelect');
    if (!sheetSelect) return;
    
    const selectedSheet = sheetSelect.value;
    if (selectedSheet) {
        loadSheetData(selectedSheet);
    } else {
        showEmptyState();
    }
}

function handleRefresh() {
    const sheetSelect = document.getElementById('sheetSelect');
    if (!sheetSelect) return;
    
    const selectedSheet = sheetSelect.value;
    if (!selectedSheet) {
        alert('Pilih sheet terlebih dahulu');
        return;
    }

    if (appState.hasChanges) {
        if (!confirm('Ada perubahan yang belum disimpan. Yakin ingin refresh?')) {
            return;
        }
    }

    loadSheetData(selectedSheet, true);
}

function handleDeleteColumn(colIdx) {
    const colNum = colIdx + 1;
    if (!confirm(`⚠️ Yakin ingin menghapus Item ${colNum}?\n\nData yang dihapus tidak dapat dikembalikan!`)) {
        return;
    }
    deleteColumn(colIdx);
}

async function handleFormSubmit(event) {
    event.preventDefault();
    
    const areaInput = document.getElementById('area');
    const itemInput = document.getElementById('itemPemeriksaan');
    const statusInput = document.getElementById('status');
    const keteranganInput = document.getElementById('keterangan');
    
    if (!areaInput || !itemInput || !statusInput || !keteranganInput) {
        alert('❌ Form elements tidak ditemukan!');
        return;
    }
    
    const area = areaInput.value;
    const itemPemeriksaan = itemInput.value;
    const status = statusInput.value;
    const keterangan = keteranganInput.value;

    const rowData = [
        area,
        itemPemeriksaan,
        status,
        keterangan
    ];

    await addColumn(rowData);
    closeModal();
}

function closeModal() {
    const modal = document.getElementById('dataModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============ INITIALIZATION ============
window.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, waiting for Google APIs...');
    setTimeout(() => {
        if (typeof gapi !== 'undefined') {
            gapiLoaded();
        }
        if (typeof google !== 'undefined') {
            gisLoaded();
        }
    }, 500);
});

window.onclick = function(event) {
    const modal = document.getElementById('dataModal');
    if (modal && event.target === modal) {
        closeModal();
    }
}
