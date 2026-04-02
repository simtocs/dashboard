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
    return true;
}

// ============ AUTO-LOGOUT INACTIVITY TIMER ============
let inactivityTimer;
let warningTimer;
let countdownInterval;
const INACTIVITY_LIMIT = 5 * 60 * 1000;
const WARNING_TIME = 60 * 1000;

function startInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    
    document.getElementById('logoutWarning').classList.remove('show');
    
    warningTimer = setTimeout(() => {
        showLogoutWarning();
    }, INACTIVITY_LIMIT - WARNING_TIME);
    
    inactivityTimer = setTimeout(() => {
        logout('Anda telah logout otomatis karena tidak ada aktivitas selama 5 menit');
    }, INACTIVITY_LIMIT);
}

function showLogoutWarning() {
    document.getElementById('logoutWarning').classList.add('show');
    let countdown = 60;
    document.getElementById('warningCountdown').textContent = countdown;
    
    countdownInterval = setInterval(() => {
        countdown--;
        document.getElementById('warningCountdown').textContent = countdown;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
}

function resetInactivityTimer() {
    startInactivityTimer();
}

const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
activityEvents.forEach(event => {
    document.addEventListener(event, resetInactivityTimer, true);
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

if (checkAuth()) {
    const authData = getAuthData();
    if (authData?.username) {
        document.getElementById('displayUsername').textContent = authData.username;
    }
    if (authData?.role) {
        updateUIBasedOnRole(authData.role);
    }
}

// ============ DROPDOWN HANDLING ============
let selectedYear = null;
let selectedMonth = null;

// ============ CONFIG ============
const CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SPREADSHEET_ID: '11mcPMAfI30QJNI5Vp9M5XW2kyglLVsfRkC2uFNDD1sQ',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    CACHE_DURATION: 5 * 60 * 1000
};

// ============================================
// TAMBAHKAN KODE INI KE FILE listrik2025.js
// Letakkan setelah bagian CONFIG
// ============================================

// ============ PLN API INTEGRATION ============
const PLN_API = {
    endpoint: '/api/pln-inquiry',  // Endpoint Vercel
    isLoading: false
};

/**
 * Fetch data tagihan PLN dari API
 */
async function fetchPLNData(customerNumber) {
    if (!customerNumber || customerNumber.length !== 12) {
        return {
            status: false,
            message: 'Nomor pelanggan harus 12 digit'
        };
    }

    try {
        PLN_API.isLoading = true;
        
        const response = await fetch(PLN_API.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                customer_number: customerNumber 
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
        
    } catch (error) {
        console.error('Error fetching PLN data:', error);
        return {
            status: false,
            message: 'Gagal terhubung ke server PLN: ' + error.message
        };
    } finally {
        PLN_API.isLoading = false;
    }
}

/**
 * Auto-fill form dengan data dari PLN API
 */
async function autoFillFromPLN() {
    const idPelanggan = document.getElementById('idPelanggan').value.trim();
    
    if (!idPelanggan) {
        alert('⚠️ Masukkan ID Pelanggan terlebih dahulu!');
        return;
    }
    
    if (idPelanggan.length !== 12) {
        alert('⚠️ ID Pelanggan harus 12 digit!');
        return;
    }
    
    // Show loading indicator
    const autoFillBtn = document.getElementById('autoFillBtn');
    const originalText = autoFillBtn.innerHTML;
    autoFillBtn.disabled = true;
    autoFillBtn.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⏳</span> Mengambil data...';
    
    try {
        const result = await fetchPLNData(idPelanggan);
        
        if (result.status) {
            // Success - auto fill form fields
            document.getElementById('namaToko').value = result.customer_name || '';
            document.getElementById('standAkhir').value = result.stand_meter || '';
            document.getElementById('biaya').value = result.amount || '';
            
            // Auto calculate penggunaan if standAwal exists
            calculateUsage();
            
            // Show success notification
            showNotification('✅ Data berhasil diambil dari PLN!', 'success');
            
            // Optional: Show detailed info
            showPLNDataPreview(result);
            
        } else {
            // Failed
            alert('❌ Gagal mengambil data PLN:\n\n' + result.message);
        }
        
    } catch (error) {
        alert('❌ Error: ' + error.message);
    } finally {
        // Restore button
        autoFillBtn.disabled = false;
        autoFillBtn.innerHTML = originalText;
    }
}

/**
 * Show PLN data preview in modal
 */
function showPLNDataPreview(data) {
    const previewHTML = `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        ">
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">📊 Data dari PLN:</h4>
            <div style="font-size: 13px; line-height: 1.8;">
                <div><strong>Nama:</strong> ${data.customer_name}</div>
                <div><strong>Segmentasi:</strong> ${data.segmentation}</div>
                <div><strong>Daya:</strong> ${data.power}</div>
                <div><strong>Periode:</strong> ${data.period}</div>
                <div><strong>Stand Meter:</strong> ${formatNumber(data.stand_meter)}</div>
                <div><strong>Tagihan:</strong> ${formatRupiah(data.amount)}</div>
            </div>
        </div>
    `;
    
    // Insert before form buttons
    const existingPreview = document.getElementById('plnDataPreview');
    if (existingPreview) {
        existingPreview.remove();
    }
    
    const formButtons = document.querySelector('.form-buttons');
    const previewDiv = document.createElement('div');
    previewDiv.id = 'plnDataPreview';
    previewDiv.innerHTML = previewHTML;
    formButtons.parentNode.insertBefore(previewDiv, formButtons);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
    
    notification.style.cssText = `
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
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================
// UPDATE FUNGSI openAddModal dan openEditModal
// ============================================

// GANTI fungsi openAddModal yang ada dengan yang ini:
function openAddModal() {
    if (!appState.currentMonth) {
        alert('Pilih bulan terlebih dahulu!');
        return;
    }

    if (appState.currentMonth === 'Informasi_Umum') {
        openAddModalInfo();
        return;
    }

    document.getElementById('modalTitle').textContent = 'Tambah Data Baru';
    document.getElementById('submitBtnText').textContent = 'Simpan';
    document.getElementById('dataForm').reset();
    document.getElementById('editRowIndex').value = '';
    
    const form = document.getElementById('dataForm');
    form.querySelectorAll('.form-group').forEach(group => {
        group.style.display = 'block';
    });
    
    // Remove existing PLN preview if any
    const existingPreview = document.getElementById('plnDataPreview');
    if (existingPreview) existingPreview.remove();
    
    // Add Auto-Fill button if not exists
    addAutoFillButton();
    
    document.getElementById('dataModal').classList.add('active');
}

function openEditModal(rowIndex) {
    if (!appState.currentData || appState.currentData.length < rowIndex) {
        alert('Data tidak ditemukan!');
        return;
    }
    const row = appState.currentData[rowIndex - 1];
    const form = document.getElementById('dataForm');

    form.querySelectorAll('.form-group').forEach(group => {
        group.style.display = 'block';
    });

    document.getElementById('modalTitle').textContent = 'Edit Data';
    document.getElementById('submitBtnText').textContent = 'Update';
    document.getElementById('editRowIndex').value = rowIndex;

    document.getElementById('nomor').value = row[0] || '';
    document.getElementById('namaToko').value = row[1] || '';
    
    document.getElementById('standAwal').value = parseNumber(row[3]);
    document.getElementById('standAkhir').value = parseNumber(row[4]);
    document.getElementById('biaya').value = parseNumber(row[6]);

    calculateUsage();
    addAutoFillButton();
    document.getElementById('dataModal').classList.add('active');
}


function addAutoFillButton() {
    const idPelangganGroup = document.querySelector('label[for="idPelanggan"]')?.parentElement;
    if (!idPelangganGroup) return;
    
    // Check if button already exists
    if (document.getElementById('autoFillBtn')) return;
    
    // Create button
    const autoFillBtn = document.createElement('button');
    autoFillBtn.type = 'button';
    autoFillBtn.id = 'autoFillBtn';
    autoFillBtn.className = 'btn-autofill';
    autoFillBtn.innerHTML = '🔄 Auto-Fill dari PLN';
    autoFillBtn.onclick = autoFillFromPLN;
    
    autoFillBtn.style.cssText = `
        margin-top: 8px;
        padding: 8px 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 6px;
        justify-content: center;
    `;
    
    // Add hover effect
    autoFillBtn.onmouseenter = () => {
        autoFillBtn.style.transform = 'translateY(-2px)';
        autoFillBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    };
    autoFillBtn.onmouseleave = () => {
        autoFillBtn.style.transform = 'translateY(0)';
        autoFillBtn.style.boxShadow = 'none';
    };
    
    idPelangganGroup.appendChild(autoFillBtn);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// SELESAI - Integrasi PLN API
// ============================================

// ============ OAUTH STATE ============
let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

// ============ STATE MANAGEMENT ============
let appState = {
    currentMonth: null,
    cache: {},
    lastUpdate: null,
    currentData: []
};

// ============ OAUTH INITIALIZATION ============
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: CONFIG.API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
        });
        gapiInited = true;
        maybeEnableButtons();
        console.log('GAPI client initialized');
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
    }
}

// ============ TOKEN STORAGE ============
function storeOAuthToken(token, expiresIn = 3600) {
    try {
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('oauth_token', token);
        localStorage.setItem('oauth_expiry', expiryTime.toString());
        console.log('OAuth token stored, expires in:', expiresIn, 'seconds');
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
            console.log('Using stored OAuth token, expires in:', Math.floor((expiryTime - now) / 1000), 'seconds');
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
        alert('Sudah terauthentikasi!');
        return;
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
        if (appState.currentMonth) {
            loadMonthData(appState.currentMonth, true);
        }
        alert('✅ Berhasil authenticate! Sekarang Anda bisa menambah, edit, dan hapus data.\n\nToken akan tetap aktif selama sesi browser ini.');
        console.log('Authenticated successfully, token expires in:', expiresIn, 'seconds');
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function updateAuthButton(isAuthenticated) {
    const authBtn = document.getElementById('authBtn');
    const authBtnText = document.getElementById('authBtnText');
    const addBtn = document.getElementById('addBtn');
    
    if (isAuthenticated) {
        authBtn.classList.add('authenticated');
        authBtnText.textContent = '✓ Terotentikasi';
        if (addBtn) addBtn.style.display = 'inline-flex';
    } else {
        authBtn.classList.remove('authenticated');
        authBtnText.textContent = 'Authenticate';
        if (addBtn) addBtn.style.display = 'none';
    }
}

// ============ UTILITY FUNCTIONS ============
function formatRupiah(value) {
    if (!value && value !== 0) return 'Rp0';
    
    const num = typeof value === 'string' 
        ? parseFloat(value.replace(/[^\d.-]/g, ''))
        : value;
    
    if (isNaN(num)) return 'Rp0';
    
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

function formatNumber(value) {
    if (!value) return '-';
    
    const num = typeof value === 'string'
        ? parseFloat(value.replace(/[^\d.-]/g, ''))
        : value;
    
    if (isNaN(num)) return value;
    
    return new Intl.NumberFormat('id-ID').format(num);
}

function parseNumber(value) {
    if (!value) return 0;
    const str = value.toString().replace(/[^\d.-]/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

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
            <div class="empty-state-icon">⚡</div>
            <h2>Pilih Bulan untuk Melihat Data</h2>
            <p>Gunakan dropdown di atas untuk memilih bulan yang ingin ditampilkan</p>
        </div>
    `;
}

// ============ CACHE MANAGEMENT ============
function getCachedData(monthName) {
    const cached = appState.cache[monthName];
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > CONFIG.CACHE_DURATION) {
        delete appState.cache[monthName];
        return null;
    }
    
    return cached.data;
}

function setCachedData(monthName, data) {
    appState.cache[monthName] = {
        data: data,
        timestamp: Date.now()
    };
}

// ============ LOCAL STORAGE ============
function saveLastMonth(monthName) {
    try {
        const data = { month: monthName, timestamp: Date.now() };
        sessionStorage.setItem('lastMonth', JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save to sessionStorage:', e);
    }
}

function getLastMonth() {
    try {
        const stored = sessionStorage.getItem('lastMonth');
        if (!stored) return null;
        const data = JSON.parse(stored);
        if (Date.now() - data.timestamp > 3600000) return null;
        return data.month;
    } catch (e) {
        return null;
    }
}

// ============ API FUNCTIONS ============
async function loadMonthData(monthName, forceRefresh = false) {
    if (!monthName) {
        showEmptyState();
        return;
    }

    if (!forceRefresh) {
        const cached = getCachedData(monthName);
        if (cached) {
            console.log('Using cached data for:', monthName);
            displayData(cached, monthName);
            return;
        }
    }
    
    showLoading(`Memuat data: ${monthName.replace('_', ' ')}`);
    appState.currentMonth = monthName;
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(monthName)}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error.message);
        }
        
        if (!data.values || data.values.length === 0) {
            showError('Data Kosong', `Tidak ada data di bulan "${monthName.replace('_', ' ')}"`);
            return;
        }
        
        setCachedData(monthName, data.values);
        appState.lastUpdate = new Date();
        appState.currentData = data.values;

		if (!appState.idPelangganMap) {
    	appState.idPelangganMap = await fetchIdPelangganMap();
		}
        displayData(data.values, monthName);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Gagal Memuat Data', `
            ${error.message}
            <br><br>
            <strong>Bulan:</strong> "${monthName.replace('_', ' ')}"
        `);
    }
}

async function fetchIdPelangganMap() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent('Informasi_Umum')}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.values) return {};

        const map = {};
        data.values.slice(1).forEach(row => {
            const namaToko = row[1]; // Column B
            const idPelanggan = row[3]; // Column D
            if (namaToko) {
                map[namaToko] = idPelanggan ? idPelanggan.toString().trim() : '';
            }
        });
        return map;
    } catch (e) {
        console.warn('Could not fetch ID Pelanggan map:', e);
        return {}; 
    }
}

// ============ DISPLAY FUNCTIONS ============
function displayData(values, sheetName) {
    if (sheetName === 'Informasi_Umum') {
        displayInformasiUmum(values, sheetName);
        return;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row[1]);
    
    if (dataRows.length === 0) {
        showError('Data Kosong', `Tidak ada data valid di bulan "${sheetName.replace('_', ' ')}"`);
        return;
    }

    let totalPenggunaan = 0;
    let totalTagihan = 0;

    dataRows.forEach(row => {
        totalPenggunaan += parseNumber(row[5]);
        totalTagihan += parseNumber(row[6]);
    });

    const updateTime = appState.lastUpdate.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const monthDisplay = sheetName.replace('_', ' ');
    
    let html = `
        <div class="month-badge">📅 ${monthDisplay}</div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>${dataRows.length}</h3>
                <p>Total Toko</p>
            </div>
            <div class="stat-card">
                <h3>${formatNumber(totalPenggunaan)} kWh</h3>
                <p>Total Penggunaan</p>
            </div>
            <div class="stat-card">
                <h3>${formatRupiah(totalTagihan)}</h3>
                <p>Total Tagihan</p>
            </div>
        </div>
        
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Toko</th>
                        <th>Stand Awal</th>
                        <th>Stand Akhir</th>
                        <th>Penggunaan (kWh)</th>
                        <th>Biaya Listrik</th>
                        <th>Cek Tagihan</th>
                        ${accessToken ? '<th>AKSI</th>' : ''}
                    </tr>
                </thead>
                <tbody>
    `;
    
    dataRows.forEach((row, index) => {
        const nomor = row[0] || (index + 1);
        const namaToko = row[1] || '-';
        const idPelanggan = appState.idPelangganMap ? appState.idPelangganMap[namaToko] : (row[2] || '');
        const standAwal = row[3] || '-';
        const standAkhir = row[4] || '-';
        const penggunaan = row[5] || '-';
        const biaya = row[6] || '-';
        const rowIndex = index + 2;

        // Salin ID button: only when biaya is empty/zero AND ID exists
        const biayaNum = parseNumber(row[6]);
        const biayaIsEmpty = !row[6] || row[6].toString().trim() === '' || row[6].toString().trim() === '-' || biayaNum === 0;
        const salinIdBtn = biayaIsEmpty && idPelanggan
            ? `<button class="btn-copy" onclick="handleCopyAndNavigate('${idPelanggan}', this)" data-copied="false" style="margin-bottom:5px;width:100%;">📋 Salin ID</button>`
            : biayaIsEmpty && !idPelanggan
                ? `<span style="color:#999;font-size:12px;display:block;margin-bottom:5px;">Tidak ada ID</span>`
                : '';

        // Status from column H (index 7)
        const status = (row[7] || '').toString().trim();
        const isSudahDibayar = status === 'Sudah Dibayar';
        const statusStyle = isSudahDibayar
            ? 'background:#d4edda;color:#155724;border:1px solid #c3e6cb;'
            : 'background:#fff3cd;color:#856404;border:1px solid #ffeeba;';

        // Admin with token gets dropdown; others get read-only badge
        const isAdmin = (() => { try { const a = getAuthData(); return a && a.role && a.role.toLowerCase() === 'admin'; } catch(e) { return false; } })();
        const statusCell = (isAdmin && accessToken)
            ? `<select class="status-select" onchange="updateStatus('${appState.currentMonth}', ${rowIndex}, this.value)" style="${statusStyle}padding:5px 8px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;width:100%;">
                    <option value="Menunggu Pembayaran" ${!isSudahDibayar ? 'selected' : ''}>⏳ Menunggu Pembayaran</option>
                    <option value="Sudah Dibayar" ${isSudahDibayar ? 'selected' : ''}>✅ Sudah Dibayar</option>
                </select>`
            : `<span style="${statusStyle}padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;display:inline-block;">
                    ${isSudahDibayar ? '✅ Sudah Dibayar' : '⏳ Menunggu Pembayaran'}
                </span>`;

        html += `
            <tr>
                <td>${nomor}</td>
                <td class="toko-name">${namaToko}</td>
                <td class="number">${formatNumber(standAwal)}</td>
                <td class="number">${formatNumber(standAkhir)}</td>
                <td class="number">${formatNumber(penggunaan)}</td>
                <td class="currency">${formatRupiah(biaya)}</td>
                <td class="actions" style="min-width:160px;">
                    ${salinIdBtn}
                    ${statusCell}
                </td>
                ${accessToken ? `
                <td class="actions">
                    <button class="btn-edit" onclick="openEditModal(${rowIndex})">✏️ Edit</button>
                    <button class="btn-delete" onclick="handleDelete(${rowIndex})">🗑️ Hapus</button>
                </td>
                ` : ''}
            </tr>
        `;
    });

    html += `
                    <tr class="total-row">
                        <td colspan="4" style="text-align: right; padding-right: 20px;">TOTAL</td>
                        <td class="number" style="color: white;">${formatNumber(totalPenggunaan)}</td>
                        <td class="currency" style="color: white;">${formatRupiah(totalTagihan)}</td>
                        <td></td>
                        ${accessToken ? '<td></td>' : ''}
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="summary-section">
            <h3>📊 Ringkasan ${monthDisplay}</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="label">Jumlah Toko</div>
                    <div class="value">${dataRows.length} Toko</div>
                </div>
                <div class="summary-item">
                    <div class="label">Total Penggunaan Listrik</div>
                    <div class="value">${formatNumber(totalPenggunaan)} kWh</div>
                </div>
                <div class="summary-item">
                    <div class="label">Rata-rata Penggunaan per Toko</div>
                    <div class="value">${formatNumber(Math.round(totalPenggunaan / dataRows.length))} kWh</div>
                </div>
                <div class="summary-item">
                    <div class="label">Total Biaya Listrik</div>
                    <div class="value">${formatRupiah(totalTagihan)}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Rata-rata Biaya per Toko</div>
                    <div class="value">${formatRupiah(Math.round(totalTagihan / dataRows.length))}</div>
                </div>
            </div>
        </div>

        <div class="last-update">
            ⏱️ Terakhir diperbarui: ${updateTime}
        </div>
    `;
    
    document.getElementById('content').innerHTML = html;
}

// ============ INFORMASI UMUM DISPLAY ============
function displayInformasiUmum(values, sheetName) {
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row[1]);
    
    if (dataRows.length === 0) {
        showError('Data Kosong', 'Tidak ada data di Informasi Umum');
        return;
    }

    const updateTime = appState.lastUpdate.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    let html = `
        <div class="month-badge">📋 Informasi Umum Toko</div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>${dataRows.length}</h3>
                <p>Total Toko Terdaftar</p>
            </div>
            <div class="stat-card">
                <h3>${dataRows.filter(row => row[2]).length}</h3>
                <p>Toko dengan Daya Listrik</p>
            </div>
            <div class="stat-card">
                <h3>${dataRows.filter(row => row[3]).length}</h3>
                <p>Toko dengan ID Pelanggan</p>
            </div>
        </div>
        
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Toko</th>
                        <th>Daya Listrik (Watt)</th>
                        <th>ID Pelanggan PLN</th>
                        <th>Alas Nama</th>
                        <th>Cek Tagihan</th>
                        ${accessToken ? '<th>AKSI</th>' : ''}
                    </tr>
                </thead>
                <tbody>
    `;
    
    dataRows.forEach((row, index) => {
        const nomor = row[0] || (index + 1);
        const namaToko = row[1] || '-';
        const dayaListrik = row[2] ? formatNumber(row[2]) + ' W' : '-';
        const idPelanggan = row[3] ? row[3].toString().trim() : '-';
        const alasNama = row[4] || '-';

        const rowIndex = index + 2;

        html += `
            <tr>
                <td>${nomor}</td>
                <td class="toko-name">${namaToko}</td>
                <td class="number">${dayaListrik}</td>
                <td>${idPelanggan}</td>
                <td>${alasNama}</td>
                <td class="actions">
                    ${idPelanggan && idPelanggan !== '-' ? 
                        `<button class="btn-copy" onclick="handleCopyAndNavigate('${idPelanggan}', this)" data-copied="false">
                            📋 Salin ID
                        </button>` 
                        : '<span style="color: #999;">-</span>'}
                </td>
                ${accessToken ? `
                <td class="actions">
                    <button class="btn-edit" onclick="openEditModalInfo(${rowIndex})">✏️ Edit</button>
                    <button class="btn-delete" onclick="handleDelete(${rowIndex})">🗑️ Hapus</button>
                </td>
                ` : ''}
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>

        <div class="summary-section">
            <h3>📊 Ringkasan Informasi Umum</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="label">Total Toko Terdaftar</div>
                    <div class="value">${dataRows.length} Toko</div>
                </div>
                <div class="summary-item">
                    <div class="label">Toko dengan Daya Listrik</div>
                    <div class="value">${dataRows.filter(row => row[2]).length} Toko</div>
                </div>
                <div class="summary-item">
                    <div class="label">Toko dengan ID Pelanggan</div>
                    <div class="value">${dataRows.filter(row => row[3]).length} Toko</div>
                </div>
                <div class="summary-item">
                    <div class="label">Toko dengan Alas Nama</div>
                    <div class="value">${dataRows.filter(row => row[4]).length} Toko</div>
                </div>
            </div>
        </div>

        <div class="last-update">
            ⏱️ Terakhir diperbarui: ${updateTime}
        </div>
    `;
    
    document.getElementById('content').innerHTML = html;
}

// ============ COPY AND NAVIGATE FUNCTION ============
async function handleCopyAndNavigate(idPelanggan, button) {
    const isCopied = button.getAttribute('data-copied') === 'true';
    
    if (!isCopied) {
        try {
            await navigator.clipboard.writeText(idPelanggan);
            
            button.setAttribute('data-copied', 'true');
            button.classList.add('copied');
            button.innerHTML = '✓ Cek Biaya';
            
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                z-index: 9999;
                font-weight: 600;
                animation: slideInRight 0.3s ease-out;
            `;
            notification.textContent = `✓ ID ${idPelanggan} tersalin! Klik lagi untuk cek tagihan`;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'slideOutRight 0.3s ease-out';
                setTimeout(() => notification.remove(), 300);
            }, 3000);
            
            setTimeout(() => {
                button.setAttribute('data-copied', 'false');
                button.classList.remove('copied');
                button.innerHTML = '📋 Salin ID';
            }, 5000);
            
        } catch (err) {
            console.error('Failed to copy:', err);
            alert('❌ Gagal menyalin ID Pelanggan');
        }
    } else {
        const url = 'https://member.speedcash.co.id/pln/cek-tagihan-listrik';
        window.open(url, '_blank');
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            background: linear-gradient(135deg, #FF69B4 0%, #4A90E2 100%);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 9999;
            font-weight: 600;
            animation: slideInRight 0.3s ease-out;
        `;
        notification.textContent = '🔗 Membuka halaman cek tagihan...';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        button.setAttribute('data-copied', 'false');
        button.classList.remove('copied');
        button.innerHTML = '📋 Salin ID';
    }
}

// ============ MODAL FUNCTIONS ============
function openAddModal() {
    if (!appState.currentMonth) {
        alert('Pilih bulan terlebih dahulu!');
        return;
    }

    if (appState.currentMonth === 'Informasi_Umum') {
        openAddModalInfo();
        return;
    }

    document.getElementById('modalTitle').textContent = 'Tambah Data Baru';
    document.getElementById('submitBtnText').textContent = 'Simpan';
    document.getElementById('dataForm').reset();
    document.getElementById('editRowIndex').value = '';
    
    // Show all fields for regular data entry
    const form = document.getElementById('dataForm');
    form.querySelectorAll('.form-group').forEach(group => {
        group.style.display = 'block';
    });
    
    document.getElementById('dataModal').classList.add('active');
}

function openAddModalInfo() {
    const modal = document.getElementById('dataModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('dataForm');
    
    modalTitle.textContent = 'Tambah Data Toko';
    document.getElementById('submitBtnText').textContent = 'Simpan';
    document.getElementById('editRowIndex').value = '';
    
    // Hide fields not needed for Informasi_Umum
    form.querySelector('label[for="standAwal"]').parentElement.style.display = 'none';
    form.querySelector('label[for="standAkhir"]').parentElement.style.display = 'none';
    form.querySelector('label[for="penggunaan"]').parentElement.style.display = 'none';
    form.querySelector('label[for="biaya"]').parentElement.style.display = 'none';
    
    form.reset();
    modal.classList.add('active');
}

function openEditModalInfo(rowIndex) {
    if (!appState.currentData || appState.currentData.length < rowIndex) {
        alert('Data tidak ditemukan!');
        return;
    }
	
	const row = appState.currentData[rowIndex - 1];
const modal = document.getElementById('dataModal');
const form = document.getElementById('dataForm');

document.getElementById('modalTitle').textContent = 'Edit Data Toko';
document.getElementById('submitBtnText').textContent = 'Update';
document.getElementById('editRowIndex').value = rowIndex;

// Hide fields not needed for Informasi_Umum
form.querySelector('label[for="standAwal"]').parentElement.style.display = 'none';
form.querySelector('label[for="standAkhir"]').parentElement.style.display = 'none';
form.querySelector('label[for="penggunaan"]').parentElement.style.display = 'none';
form.querySelector('label[for="biaya"]').parentElement.style.display = 'none';

document.getElementById('nomor').value = row[0] || '';
document.getElementById('namaToko').value = row[1] || '';
document.getElementById('idPelanggan').value = row[3] || '';

modal.classList.add('active');
}
function openEditModal(rowIndex) {
if (!appState.currentData || appState.currentData.length < rowIndex) {
alert('Data tidak ditemukan!');
return;
}
const row = appState.currentData[rowIndex - 1];
const form = document.getElementById('dataForm');

// Show all fields for regular data entry
form.querySelectorAll('.form-group').forEach(group => {
    group.style.display = 'block';
});

document.getElementById('modalTitle').textContent = 'Edit Data';
document.getElementById('submitBtnText').textContent = 'Update';
document.getElementById('editRowIndex').value = rowIndex;

document.getElementById('nomor').value = row[0] || '';
document.getElementById('namaToko').value = row[1] || '';
document.getElementById('standAwal').value = parseNumber(row[3]);
document.getElementById('standAkhir').value = parseNumber(row[4]);
document.getElementById('biaya').value = parseNumber(row[6]);

calculateUsage();

document.getElementById('dataModal').classList.add('active');
}
function closeModal() {
const modal = document.getElementById('dataModal');
const form = document.getElementById('dataForm');
modal.classList.remove('active');
form.reset();
}
// ============ AUTO CALCULATION ============
function calculateUsage() {
const standAwal = parseNumber(document.getElementById('standAwal').value) || 0;
const standAkhir = parseNumber(document.getElementById('standAkhir').value) || 0;
const penggunaan = standAkhir - standAwal;

document.getElementById('penggunaan').value = penggunaan >= 0 ? penggunaan : 0;
}
// ============ CRUD FUNCTIONS ============
async function addRow(sheetName, rowData) {
if (!accessToken) {
alert('❌ Harap authenticate terlebih dahulu!\n\nKlik tombol "Authenticate" di pojok kanan atas.');
return;
}
try {
    const response = await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${sheetName}!A:H`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [rowData]
        }
    });
    
    console.log('Row added:', response);
    
    delete appState.cache[sheetName];
    await loadMonthData(sheetName, true);
    
    alert('✅ Data berhasil ditambahkan!');
    return response;
} catch (error) {
    console.error('Error adding row:', error);
    alert('❌ Gagal menambahkan data: ' + error.message);
    throw error;
}
}
async function updateRow(sheetName, rowIndex, rowData) {
if (!accessToken) {
alert('❌ Harap authenticate terlebih dahulu!\n\nKlik tombol "Authenticate" di pojok kanan atas.');
return;
}
try {
    const response = await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: `${sheetName}!A${rowIndex}:H${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [rowData]
        }
    });
    
    console.log('Row updated:', response);
    
    delete appState.cache[sheetName];
    await loadMonthData(sheetName, true);
    
    alert('✅ Data berhasil diupdate!');
    return response;
} catch (error) {
    console.error('Error updating row:', error);
    alert('❌ Gagal mengupdate data: ' + error.message);
    throw error;
}
}
async function deleteRow(sheetName, rowIndex) {
if (!accessToken) {
alert('❌ Harap authenticate terlebih dahulu!\n\nKlik tombol "Authenticate" di pojok kanan atas.');
return;
}
try {
    const spreadsheet = await gapi.client.sheets.spreadsheets.get({
        spreadsheetId: CONFIG.SPREADSHEET_ID
    });
    
    const sheet = spreadsheet.result.sheets.find(
        s => s.properties.title === sheetName
    );
    
    if (!sheet) {
        throw new Error('Sheet not found');
    }
    
    const sheetId = sheet.properties.sheetId;
    
    const response = await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        }
    });
    
    console.log('Row deleted:', response);
    
    delete appState.cache[sheetName];
    await loadMonthData(sheetName, true);
    
    alert('✅ Baris berhasil dihapus sepenuhnya!');
    return response;
} catch (error) {
    console.error('Error deleting row:', error);
    alert('❌ Gagal menghapus baris: ' + error.message);
    throw error;
}
}


// ============ STATUS UPDATE FUNCTION ============
async function updateStatus(sheetName, rowIndex, newStatus) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }
    try {
        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${sheetName}!H${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[newStatus]] }
        });

        // Update local data so badge refreshes without full reload
        if (appState.currentData[rowIndex - 2] !== undefined) {
            appState.currentData[rowIndex - 2][7] = newStatus;
        }
        delete appState.cache[sheetName];

        showNotification(
            newStatus === 'Sudah Dibayar'
                ? '✅ Status: Sudah Dibayar'
                : '⏳ Status: Menunggu Pembayaran',
            'success'
        );
        return response;
    } catch (error) {
        console.error('Error updating status:', error);
        alert('❌ Gagal memperbarui status: ' + error.message);
        throw error;
    }
}

// ============ EVENT HANDLERS ============
/**
 * Handle year selection change
 */
function handleYearChange() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    
    selectedYear = yearSelect.value;
    
    if (selectedYear) {
        // Enable month dropdown
        monthSelect.disabled = false;
        monthSelect.style.opacity = '1';
        monthSelect.style.cursor = 'pointer';
        
        // Reset month selection
        monthSelect.value = '';
        selectedMonth = null;
        
        // Clear content area
        showEmptyState();
        document.getElementById('content').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h2>Pilih Bulan untuk Tahun ${selectedYear}</h2>
                <p>Gunakan dropdown bulan untuk memilih data yang ingin ditampilkan</p>
            </div>
        `;
    } else {
        // Disable month dropdown if no year selected
        monthSelect.disabled = true;
        monthSelect.style.opacity = '0.5';
        monthSelect.style.cursor = 'not-allowed';
        monthSelect.value = '';
        selectedMonth = null;
        showEmptyState();
    }
}

/**
 * Handle month selection change
 */
function handleMonthChange() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    
    selectedYear = yearSelect.value;
    selectedMonth = monthSelect.value;
    
    if (!selectedYear) {
        alert('⚠️ Pilih tahun terlebih dahulu!');
        monthSelect.value = '';
        return;
    }
    
    if (selectedMonth) {
        // Build the sheet name
        let sheetName;
        if (selectedMonth === 'Informasi_Umum') {
            sheetName = 'Informasi_Umum';
        } else {
            sheetName = `${selectedMonth}_${selectedYear}`;
        }
        
        // Save to session storage
        saveLastSelection(selectedYear, selectedMonth);
        
        // Load the data
        loadMonthData(sheetName);
    } else {
        showEmptyState();
    }
}

/**
 * Handle refresh button
 */
function handleRefresh() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    
    selectedYear = yearSelect.value;
    selectedMonth = monthSelect.value;
    
    if (!selectedYear) {
        alert('⚠️ Pilih tahun terlebih dahulu!');
        return;
    }
    
    if (!selectedMonth) {
        alert('⚠️ Pilih bulan terlebih dahulu!');
        return;
    }
    
    // Build the sheet name
    let sheetName;
    if (selectedMonth === 'Informasi_Umum') {
        sheetName = 'Informasi_Umum';
    } else {
        sheetName = `${selectedMonth}_${selectedYear}`;
    }
    
    loadMonthData(sheetName, true);
}

// ============ SESSION STORAGE FOR LAST SELECTION ============
/**
 * Save the last selected year and month
 */
function saveLastSelection(year, month) {
    try {
        const data = { 
            year: year, 
            month: month, 
            timestamp: Date.now() 
        };
        sessionStorage.setItem('lastSelection', JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save to sessionStorage:', e);
    }
}

/**
 * Get the last selected year and month
 */
function getLastSelection() {
    try {
        const stored = sessionStorage.getItem('lastSelection');
        if (!stored) return null;
        
        const data = JSON.parse(stored);
        
        // Check if data is less than 1 hour old
        if (Date.now() - data.timestamp > 3600000) {
            return null;
        }
        
        return { year: data.year, month: data.month };
    } catch (e) {
        return null;
    }
}

/**
 * Restore last selection on page load
 */
function restoreLastSelection() {
    const lastSelection = getLastSelection();
    
    if (lastSelection) {
        const yearSelect = document.getElementById('yearSelect');
        const monthSelect = document.getElementById('monthSelect');
        
        // Set year
        yearSelect.value = lastSelection.year;
        selectedYear = lastSelection.year;
        
        // Enable and set month
        monthSelect.disabled = false;
        monthSelect.style.opacity = '1';
        monthSelect.style.cursor = 'pointer';
        monthSelect.value = lastSelection.month;
        selectedMonth = lastSelection.month;
        
        // Load the data
        setTimeout(() => {
            let sheetName;
            if (selectedMonth === 'Informasi_Umum') {
                sheetName = 'Informasi_Umum';
            } else {
                sheetName = `${selectedMonth}_${selectedYear}`;
            }
            loadMonthData(sheetName);
        }, 1000);
    }
}

function handleDelete(rowIndex) {
if (!confirm('⚠️ Yakin ingin menghapus data ini?\n\nData yang dihapus tidak dapat dikembalikan!')) {
return;
}
deleteRow(appState.currentMonth, rowIndex);
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const nomor = document.getElementById('nomor').value;
    const namaToko = document.getElementById('namaToko').value;
    const editRowIndex = document.getElementById('editRowIndex').value;

    let rowData;

    if (appState.currentMonth === 'Informasi_Umum') {
        let dayaListrik = '';
    	let alasNama = '';
    	const idPelanggan = document.getElementById('idPelanggan').value;
    	
		if (editRowIndex && appState.currentData[editRowIndex - 1]) {
        const existingRow = appState.currentData[editRowIndex - 1];
        dayaListrik = existingRow[2] || '';
        alasNama = existingRow[4] || '';
    }
    
    rowData = [
        nomor,
        namaToko,
        dayaListrik,
        idPelanggan,
        alasNama
    ];
    
	} else {
        const standAwal = parseNumber(document.getElementById('standAwal').value);
        const standAkhir = parseNumber(document.getElementById('standAkhir').value);
        const penggunaan = parseNumber(document.getElementById('penggunaan').value);
        const biaya = parseNumber(document.getElementById('biaya').value);
        
        let dayaListrik = '';
        let existingStatus = '';
        
        if (editRowIndex && appState.currentData[editRowIndex - 1]) {
            const existingRow = appState.currentData[editRowIndex - 1];
            dayaListrik = existingRow[2] || ''; // Column C is Daya Listrik
            existingStatus = existingRow[7] || ''; // Column H is Status
        }

        rowData = [
            nomor,
            namaToko,
            dayaListrik, 
            standAwal,
            standAkhir,
            penggunaan,
            biaya,
            existingStatus
        ];
    }

    if (editRowIndex) {
        await updateRow(appState.currentMonth, parseInt(editRowIndex), rowData);
    } else {
        await addRow(appState.currentMonth, rowData);
    }
    closeModal();
}

// ============ INITIALIZATION ============
window.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, waiting for Google APIs...');
    
    // Initialize Google APIs
    setTimeout(() => {
        if (typeof gapi !== 'undefined') {
            gapiLoaded();
        }
        if (typeof google !== 'undefined') {
            gisLoaded();
        }
    }, 500);

    // Restore last selection if available
    setTimeout(() => {
        restoreLastSelection();
    }, 1000);
});

window.onclick = function(event) {
const modal = document.getElementById('dataModal');
if (event.target === modal) {
closeModal();
}
}
