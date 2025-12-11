  // ============ CONFIG ============
const CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SPREADSHEET_ID: '1M1U3U7aNUBC9R9CP1Ca6KC5lCKSr7OFKBIB1MW7JfvM',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    CACHE_DURATION: 5 * 60 * 1000,
    
    // ✨ NEW: Year-based range configuration
    YEAR_RANGES: {
        '2025': {
            table1: 'A1:G13',    // Surplus kas toko 2025
            table2: 'I1:L23'     // Penggunaan surkas 2025
        },
        '2026': {
            table1: 'A27:G39',   // Surplus kas toko 2026
            table2: 'I27:L49'    // Penggunaan surkas 2026
        }
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
    currentData2: [],  
    currentFilter: 'all',
    currentYear: '2025'  // ✨ NEW: Default year
};

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
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes
const WARNING_TIME = 60 * 1000; // 60 seconds warning

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

// Listen for user activity
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

// Initialize auth on page load
if (checkAuth()) {
    const authData = getAuthData();
    if (authData?.username) {
        document.getElementById('displayUsername').textContent = authData.username;
    }
    if (authData?.role) {
        updateUIBasedOnRole(authData.role);
    }
}

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
        showError('Gagal Inisialisasi API', 
            'Tidak dapat terhubung ke Google Sheets API. ' +
            'Silakan refresh halaman atau cek koneksi internet Anda.<br><br>' +
            'Detail: ' + (error.result?.error?.message || error.message)
        );
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
        if (appState.currentSheet) {
            loadSheetData(appState.currentSheet, true);
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
    
    if (isAuthenticated) {
        authBtn.classList.add('authenticated');
        authBtnText.textContent = '✓ Terotentikasi';
    } else {
        authBtn.classList.remove('authenticated');
        authBtnText.textContent = 'Authenticate';
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
            <div class="empty-state-icon">📊</div>
            <h2>Pilih Toko untuk Melihat Data</h2>
            <p>Gunakan dropdown di atas untuk memilih toko yang ingin ditampilkan</p>
        </div>
    `;
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

// ============ LOCAL STORAGE ============
function saveLastSheet(sheetName) {
    try {
        const data = { sheet: sheetName, timestamp: Date.now() };
        sessionStorage.setItem('lastSheet', JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save to sessionStorage:', e);
    }
}

function getLastSheet() {
    try {
        const stored = sessionStorage.getItem('lastSheet');
        if (!stored) return null;
        const data = JSON.parse(stored);
        if (Date.now() - data.timestamp > 3600000) return null;
        return data.sheet;
    } catch (e) {
        return null;
    }
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
        sheetSelect.innerHTML = '<option value="">Pilih Toko...</option>' + 
            appState.sheets.map(name => 
                `<option value="${name}">${name}</option>`
            ).join('');
        
        const lastSheet = getLastSheet();
        if (lastSheet && appState.sheets.includes(lastSheet)) {
            sheetSelect.value = lastSheet;
            loadSheetData(lastSheet);
        } else {
            showEmptyState();
        }
        
    } catch (error) {
        console.error('Error loading sheets:', error);
        showError('Gagal Memuat Daftar Sheet', `
            ${error.message}
            <br><br>
            <strong>Pastikan:</strong>
            <ul style="margin-top: 10px; margin-left: 20px;">
                <li>Spreadsheet ID benar</li>
                <li>API Key valid</li>
                <li>Google Sheets API sudah enabled</li>
                <li>Sheet sudah public</li>
            </ul>
        `);
    }
}

async function loadSheetData(sheetName, forceRefresh = false) {
    if (!sheetName) {
        showEmptyState();
        return;
    }

    // ✨ UPDATED: Use cache key that includes year
    const cacheKey = `${sheetName}_${appState.currentYear}`;
    
    if (!forceRefresh) {
        const cached = getCachedData(cacheKey);
        if (cached) {
            console.log('Using cached data for:', sheetName, 'Year:', appState.currentYear);
            displayData(cached.table1, cached.table2, sheetName);
            return;
        }
    }
    
    showLoading(`Memuat data: ${sheetName} - Tahun ${appState.currentYear}`);
    appState.currentSheet = sheetName;
    
    try {
        // ✨ UPDATED: Get ranges based on selected year
        const ranges = CONFIG.YEAR_RANGES[appState.currentYear];
        if (!ranges) {
            throw new Error(`Konfigurasi tahun ${appState.currentYear} tidak ditemukan`);
        }

        const [response1, response2] = await Promise.all([
            fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!${ranges.table1}?key=${CONFIG.API_KEY}`),
            fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!${ranges.table2}?key=${CONFIG.API_KEY}`)
        ]);
        
        const data1 = await response1.json();
        const data2 = await response2.json();
        
        if (data1.error || data2.error) {
            throw new Error(data1.error?.message || data2.error?.message);
        }
        
        const table1Data = data1.values || [];
        const table2Data = data2.values || [];
        
        if (table1Data.length === 0 && table2Data.length === 0) {
            showError('Data Kosong', `Tidak ada data di sheet "${sheetName}" untuk tahun ${appState.currentYear}`);
            return;
        }
        
        // ✨ UPDATED: Cache with year-specific key
        setCachedData(cacheKey, { table1: table1Data, table2: table2Data });
        appState.lastUpdate = new Date();
        appState.currentData = table1Data;
        appState.currentData2 = table2Data;
        
        displayData(table1Data, table2Data, sheetName);
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Gagal Memuat Data', `
            ${error.message}
            <br><br>
            <strong>Sheet:</strong> "${sheetName}"<br>
            <strong>Tahun:</strong> ${appState.currentYear}
        `);
    }
}

// ============ DATA PROCESSING ============
function processRowData(row) {
    const triwulan = row[0] || '';
    const bulan = row[1] || '';
    const ebitdaLR = parseNumber(row[2]);
    const penggunaanLabaKas = parseNumber(row[3]);
    const labaNetDitransfer = parseNumber(row[4]);
    const bayarListrik = parseNumber(row[5]);
    
    let sisaSurkas = parseNumber(row[6]);
    if (!sisaSurkas && labaNetDitransfer && bayarListrik) {
        sisaSurkas = labaNetDitransfer - bayarListrik;
    }
    
    return {
        triwulan,
        bulan,
        ebitdaLR,
        penggunaanLabaKas,
        labaNetDitransfer,
        bayarListrik,
        sisaSurkas
    };
}

function processRowDataTable2(row) {
    const no = row[0] || '';
    const bulan = row[1] || '';
    const nominalPenggunaanSurkas = parseNumber(row[2]);
    const tujuanPenggunaanSurkas = row[3] || '';
    
    return {
        no,
        bulan,
        nominalPenggunaanSurkas,
        tujuanPenggunaanSurkas
    };
}

function calculateTotals(rows) {
    return rows.reduce((totals, row) => {
        const data = processRowData(row);
        return {
            ebitdaLR: totals.ebitdaLR + data.ebitdaLR,
            penggunaanLabaKas: totals.penggunaanLabaKas + data.penggunaanLabaKas,
            labaNetDitransfer: totals.labaNetDitransfer + data.labaNetDitransfer,
            bayarListrik: totals.bayarListrik + data.bayarListrik,
            sisaSurkas: totals.sisaSurkas + data.sisaSurkas
        };
    }, {
        ebitdaLR: 0,
        penggunaanLabaKas: 0,
        labaNetDitransfer: 0,
        bayarListrik: 0,
        sisaSurkas: 0
    });
}

function calculateTotalsTable2(rows) {
    return rows.reduce((totals, row) => {
        const data = processRowDataTable2(row);
        return {
            nominalPenggunaanSurkas: totals.nominalPenggunaanSurkas + data.nominalPenggunaanSurkas
        };
    }, {
        nominalPenggunaanSurkas: 0
    });
}

// ============ FILTER FUNCTIONS ============
function handleTriwulanFilter() {
    const filterSelect = document.getElementById('triwulanFilter');
    const selectedFilter = filterSelect.value;
    appState.currentFilter = selectedFilter;

    if (selectedFilter !== 'all') {
        filterSelect.classList.add('filtered');
    } else {
        filterSelect.classList.remove('filtered');
    }

    if (appState.currentSheet && appState.currentData.length > 0) {
        displayData(appState.currentData, appState.currentData2 || [], appState.currentSheet);
    }
}

function handleYearChange() {
    const yearSelect = document.getElementById('yearFilter');
    const selectedYear = yearSelect.value;
    appState.currentYear = selectedYear;

    // Reset triwulan filter when changing year
    appState.currentFilter = 'all';
    const triwulanSelect = document.getElementById('triwulanFilter');
    if (triwulanSelect) {
        triwulanSelect.value = 'all';
        triwulanSelect.classList.remove('filtered');
    }

    // Reload data with new year
    if (appState.currentSheet) {
        // Clear cache for current sheet
        delete appState.cache[appState.currentSheet];
        loadSheetData(appState.currentSheet, true);
    }
}

function filterDataByTriwulan(dataRows) {
    if (appState.currentFilter === 'all') {
        return dataRows;
    }
    
    return dataRows.filter(row => {
        const triwulan = row[0] ? row[0].toString().trim() : '';
        return triwulan === appState.currentFilter;
    });
}

function getTriwulanLabel(value) {
    const labels = {
        '1': 'Triwulan 1 (Q1)',
        '2': 'Triwulan 2 (Q2)',
        '3': 'Triwulan 3 (Q3)',
        '4': 'Triwulan 4 (Q4)',
        'all': 'Semua Triwulan'
    };
    return labels[value] || 'Semua Triwulan';
}

// ============ DISPLAY FUNCTIONS ============
function displayData(values1, values2, sheetName) {
    const headers1 = values1[0];
    const allDataRows1 = values1.slice(1).filter(row => row[1]);
    const dataRows1 = filterDataByTriwulan(allDataRows1);
    
    const headers2 = values2.length > 0 ? values2[0] : [];
    const allDataRows2 = values2.length > 1 ? values2.slice(1).filter(row => row[0]) : [];

    const dataRows2 = appState.currentFilter !== 'all' 
        ? allDataRows2.filter(row => {
            const triwulan = row[0] ? row[0].toString().trim() : '';
            return triwulan === appState.currentFilter;
        })
        : allDataRows2;
    
    if (dataRows1.length === 0 && dataRows2.length === 0) {
        const filterLabel = getTriwulanLabel(appState.currentFilter);
        showError('Data Kosong', `Tidak ada data untuk ${filterLabel} di sheet "${sheetName}"`);
        return;
    }

    const totals1 = calculateTotals(dataRows1);
    const totals2 = calculateTotalsTable2(dataRows2);
    
    const filterBadge = appState.currentFilter !== 'all' 
        ? `<div class="filter-badge">📊 Menampilkan: ${getTriwulanLabel(appState.currentFilter)}</div>`
        : '';
    
    let html = `
    ${filterBadge}
    
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
    <h2 style="color: #FF69B4; margin: 0; font-size: 1.5em;">💰 Surplus Kas Toko - Tahun ${appState.currentYear}</h2>
    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="visualize-btn" onclick="openVisualizationModal()">
            <span>📈</span>
            <span>Visualisasi Data</span>
        </button>
        <button class="print-btn" onclick="generatePrintReport()">
            <span>🖨️</span>
            <span>Cetak Laporan</span>
        </button>
        ${accessToken ? `
        <button class="add-btn" onclick="openAddModal(1)">
            <span>➕</span>
            <span>Tambah Data Surplus Kas</span>
        </button>
        ` : ''}
    </div>
</div>
    
    <div class="stats">
        <div class="stat-card">
            <h3>${formatRupiah(totals1.ebitdaLR)}</h3>
            <p>Total EBITDA LR${appState.currentFilter !== 'all' ? ' - ' + getTriwulanLabel(appState.currentFilter) : ''}</p>
        </div>
        <div class="stat-card">
            <h3>${formatRupiah(totals1.labaNetDitransfer)}</h3>
            <p>Total Laba Net Ditransfer${appState.currentFilter !== 'all' ? ' - ' + getTriwulanLabel(appState.currentFilter) : ''}</p>
        </div>
        <div class="stat-card">
            <h3>${formatRupiah(totals1.bayarListrik)}</h3>
            <p>Total Bayar Listrik${appState.currentFilter !== 'all' ? ' - ' + getTriwulanLabel(appState.currentFilter) : ''}</p>
        </div>
        <div class="stat-card-finale">
            <h3>${formatRupiah(totals1.sisaSurkas)}</h3>
            <p>Total Sisa Surplus Kas${appState.currentFilter !== 'all' ? ' - ' + getTriwulanLabel(appState.currentFilter) : ''}</p>
        </div>
    </div>
    
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>TRIWULAN</th>
                    <th>BULAN</th>
                    <th>EBITDA LR</th>
                    <th>PENGGUNAAN LABA KAS</th>
                    <th>LABA NET DITRANSFER</th>
                    <th>BAYAR LISTRIK</th>
                    <th>SISA SURKAS</th>
                    ${accessToken ? '<th>AKSI</th>' : ''}
                </tr>
            </thead>
            <tbody>
    `;
    
    dataRows1.forEach((row, index) => {
        const data = processRowData(row);
        let colorClass = 'zero';
        if (data.sisaSurkas > 0) colorClass = 'positive';
        else if (data.sisaSurkas < 0) colorClass = 'negative';
        
        const originalIndex = allDataRows1.findIndex(r => 
            r[0] === row[0] && r[1] === row[1] && r[2] === row[2]
        );
        const rowIndex = originalIndex + 2;

        html += `
            <tr>
                <td class="triwulan">${data.triwulan}</td>
                <td class="month">${data.bulan}</td>
                <td class="currency">${formatRupiah(data.ebitdaLR)}</td>
                <td class="currency">${formatRupiah(data.penggunaanLabaKas)}</td>
                <td class="currency">${formatRupiah(data.labaNetDitransfer)}</td>
                <td class="currency">${formatRupiah(data.bayarListrik)}</td>
                <td class="currency ${colorClass}">${formatRupiah(data.sisaSurkas)}</td>
                ${accessToken ? `
                <td class="actions">
                    <button class="btn-edit" onclick="openEditModal(${rowIndex}, 1)">✏️ Edit</button>
                    <button class="btn-delete" onclick="handleDelete(${rowIndex}, 1)">🗑️ Hapus</button>
                </td>
                ` : ''}
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    </div>
    `;
    
    html += `
    <div style="display: flex; justify-content: space-between; align-items: center; margin: 40px 0 20px 0;">
        <h2 style="color: #FF69B4; margin: 0; font-size: 1.5em;">📋 Penggunaan Surkas - Tahun ${appState.currentYear}</h2>
        ${accessToken ? `
        <button class="add-btn" onclick="openAddModal(2)" style="display: inline-flex;">
            <span>➕</span>
            <span>Tambah Data Penggunaan Surkas</span>
        </button>
        ` : ''}
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <h3>${formatRupiah(totals2.nominalPenggunaanSurkas)}</h3>
            <p>Total Nominal Penggunaan Surkas${appState.currentFilter !== 'all' ? ' - ' + getTriwulanLabel(appState.currentFilter) : ''}</p>
        </div>
        <div class="stat-card">
            <h3>${dataRows2.length}</h3>
            <p>Total Transaksi</p>
        </div>
    </div>
    
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>TRIWULAN (Q)</th>
                    <th>BULAN</th>
                    <th>NOMINAL PENGGUNAAN SURKAS</th>
                    <th>TUJUAN PENGGUNAAN SURKAS</th>
                    ${accessToken ? '<th>AKSI</th>' : ''}
                </tr>
            </thead>
            <tbody>
    `;
    
    dataRows2.forEach((row, index) => {
        const data = processRowDataTable2(row);
        const rowIndex = index + 2;

        html += `
            <tr>
                <td class="triwulan">${data.no || (index + 1)}</td>
                <td class="month">${data.bulan}</td>
                <td class="currency">${formatRupiah(data.nominalPenggunaanSurkas)}</td>
                <td>${data.tujuanPenggunaanSurkas}</td>
                ${accessToken ? `
                <td class="actions">
                    <button class="btn-edit" onclick="openEditModal(${rowIndex}, 2)">✏️ Edit</button>
                    <button class="btn-delete" onclick="handleDelete(${rowIndex}, 2)">🗑️ Hapus</button>
                </td>
                ` : ''}
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    </div>
    `;
    
    document.getElementById('content').innerHTML = html;
}

// ============ MODAL FUNCTIONS ============
function openAddModal(tableNumber) {
    if (!appState.currentSheet) {
        alert('Pilih toko terlebih dahulu!');
        return;
    }

    document.getElementById('modalTitle').textContent = tableNumber === 1 ? 'Tambah Data - Surplus Kas' : 'Tambah Data - Penggunaan Surkas';
    document.getElementById('submitBtnText').textContent = 'Simpan';
    document.getElementById('dataForm').reset();
    document.getElementById('editRowIndex').value = '';
    document.getElementById('editTableNumber').value = tableNumber;
    
    // Get all form inputs
    const table1Inputs = document.querySelectorAll('#table1Fields input, #table1Fields select');
    const table2Inputs = document.querySelectorAll('#table2Fields input, #table2Fields select');
    
    if (tableNumber === 1) {
        document.getElementById('table1Fields').style.display = 'block';
        document.getElementById('table2Fields').style.display = 'none';
        
        // Enable required for table 1, disable for table 2
        table1Inputs.forEach(input => {
            if (input.id !== 'labaNetDitransfer' && input.id !== 'sisaSurkas') {
                input.setAttribute('required', 'required');
            }
        });
        table2Inputs.forEach(input => input.removeAttribute('required'));
        
    } else {
        document.getElementById('table1Fields').style.display = 'none';
        document.getElementById('table2Fields').style.display = 'block';
        
        // Enable required for table 2, disable for table 1
        table2Inputs.forEach(input => {
            // Set required on all fields except 'no2'
            if (input.id !== 'no2') {
                input.setAttribute('required', 'required');
            }
        });
        table1Inputs.forEach(input => input.removeAttribute('required'));
    }
    
    document.getElementById('dataModal').classList.add('active');
}

function openEditModal(rowIndex, tableNumber) {
    // Get all form inputs for later required attribute management
    const table1Inputs = document.querySelectorAll('#table1Fields input, #table1Fields select');
    const table2Inputs = document.querySelectorAll('#table2Fields input, #table2Fields select');
    
    if (tableNumber === 1) {
        // Validate data exists
        if (!appState.currentData || appState.currentData.length < rowIndex) {
            alert('Data tidak ditemukan!');
            return;
        }

        // Get row data
        const row = appState.currentData[rowIndex - 1];
        const data = processRowData(row);

        // Set modal title and mode
        document.getElementById('modalTitle').textContent = 'Edit Data - Surplus Kas';
        document.getElementById('submitBtnText').textContent = 'Update';
        
        // Set row index with year offset
        const yearOffset = appState.currentYear === '2026' ? 26 : 0;
        document.getElementById('editRowIndex').value = rowIndex + yearOffset;
        document.getElementById('editTableNumber').value = tableNumber;
        
        // Show/hide appropriate field sections
        document.getElementById('table1Fields').style.display = 'block';
        document.getElementById('table2Fields').style.display = 'none';
        
        // Populate form fields
        document.getElementById('triwulan').value = data.triwulan;
        document.getElementById('bulan').value = data.bulan;
        document.getElementById('ebitdaLR').value = data.ebitdaLR;
        document.getElementById('penggunaanLabaKas').value = data.penggunaanLabaKas;
        document.getElementById('bayarListrik').value = data.bayarListrik;
        
        // Calculate auto-filled fields
        calculateValues();
        
        // Manage required attributes: enable for table 1, disable for table 2
        table1Inputs.forEach(input => {
            // Don't set required on readonly/auto-calculated fields
            if (input.id !== 'labaNetDitransfer' && input.id !== 'sisaSurkas') {
                input.setAttribute('required', 'required');
            }
        });
        table2Inputs.forEach(input => {
            input.removeAttribute('required');
        });
        
    } else if (tableNumber === 2) {
        // Validate data exists
        if (!appState.currentData2 || appState.currentData2.length < rowIndex) {
            alert('Data tidak ditemukan!');
            return;
        }

        // Get row data
        const row = appState.currentData2[rowIndex - 1];
        const data = processRowDataTable2(row);

        // Set modal title and mode
        document.getElementById('modalTitle').textContent = 'Edit Data - Penggunaan Surkas';
        document.getElementById('submitBtnText').textContent = 'Update';
        
        // Set row index with year offset
        const yearOffset = appState.currentYear === '2026' ? 26 : 0;
        document.getElementById('editRowIndex').value = rowIndex + yearOffset;
        document.getElementById('editTableNumber').value = tableNumber;
        
        // Show/hide appropriate field sections
        document.getElementById('table1Fields').style.display = 'none';
        document.getElementById('table2Fields').style.display = 'block';
        
        // Populate form fields
        document.getElementById('no2').value = data.no;
        document.getElementById('bulan2').value = data.bulan;
        document.getElementById('nominalPenggunaanSurkas').value = data.nominalPenggunaanSurkas;
        document.getElementById('tujuanPenggunaanSurkas').value = data.tujuanPenggunaanSurkas;
        
        // Manage required attributes: enable for table 2, disable for table 1
        table2Inputs.forEach(input => {
            // Set required on all table 2 fields except 'no2' which can be optional
            if (input.id !== 'no2') {
                input.setAttribute('required', 'required');
            }
        });
        table1Inputs.forEach(input => {
            input.removeAttribute('required');
        });
    }

    // Open the modal
    document.getElementById('dataModal').classList.add('active');
}

function closeModal() {
    document.getElementById('dataModal').classList.remove('active');
    document.getElementById('dataForm').reset();
}

// ============ AUTO CALCULATION ============
function calculateValues() {
    const ebitdaLR = parseNumber(document.getElementById('ebitdaLR').value) || 0;
    const penggunaanLabaKas = parseNumber(document.getElementById('penggunaanLabaKas').value) || 0;
    const bayarListrik = parseNumber(document.getElementById('bayarListrik').value) || 0;
    
    const labaNetDitransfer = ebitdaLR - penggunaanLabaKas;
    const sisaSurkas = labaNetDitransfer - bayarListrik;
    
    document.getElementById('labaNetDitransfer').value = labaNetDitransfer;
    document.getElementById('sisaSurkas').value = sisaSurkas;
}

// ============ CRUD FUNCTIONS ============
async function addRow(sheetName, rowData, tableNumber) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!\n\nKlik tombol "Authenticate" di pojok kanan atas.');
        return;
    }
    
    try {
        // ✨ UPDATED: Get range based on year and table
        const ranges = CONFIG.YEAR_RANGES[appState.currentYear];
        if (!ranges) {
            throw new Error(`Konfigurasi tahun ${appState.currentYear} tidak ditemukan`);
        }
        
        const range = tableNumber === 1 ? ranges.table1 : ranges.table2;
        
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${sheetName}!${range}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [rowData]
            }
        });
        
        console.log('Row added:', response);
        
        // ✨ UPDATED: Clear cache with year-specific key
        delete appState.cache[`${sheetName}_${appState.currentYear}`];
        await loadSheetData(sheetName, true);
        
        alert('✅ Data berhasil ditambahkan!');
        return response;
    } catch (error) {
        console.error('Error adding row:', error);
        alert('❌ Gagal menambahkan data: ' + error.message);
        throw error;
    }
}

async function updateRow(sheetName, rowIndex, rowData, tableNumber) {
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!\n\nKlik tombol "Authenticate" di pojok kanan atas.');
        return;
    }
    
    try {
        // ✨ UPDATED: Get range based on year and table
        const ranges = CONFIG.YEAR_RANGES[appState.currentYear];
        if (!ranges) {
            throw new Error(`Konfigurasi tahun ${appState.currentYear} tidak ditemukan`);
        }
        
        const range = tableNumber === 1 ? ranges.table1 : ranges.table2;
        const startCol = range.split(':')[0].match(/[A-Z]+/)[0];
        const endCol = range.split(':')[1].match(/[A-Z]+/)[0];
        
        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${sheetName}!${startCol}${rowIndex}:${endCol}${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [rowData]
            }
        });
        
        console.log('Row updated:', response);
        
        // ✨ UPDATED: Clear cache with year-specific key
        delete appState.cache[`${sheetName}_${appState.currentYear}`];
        await loadSheetData(sheetName, true);
        
        alert('✅ Data berhasil diupdate!');
        return response;
    } catch (error) {
        console.error('Error updating row:', error);
        alert('❌ Gagal mengupdate data: ' + error.message);
        throw error;
    }
}

async function deleteRow(sheetName, rowIndex, tableNumber) {
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
        
        // ✨ UPDATED: Clear cache with year-specific key
        delete appState.cache[`${sheetName}_${appState.currentYear}`];
        await loadSheetData(sheetName, true);
        
        alert('✅ Baris berhasil dihapus sepenuhnya!');
        return response;
    } catch (error) {
        console.error('Error deleting row:', error);
        alert('❌ Gagal menghapus baris: ' + error.message);
        throw error;
    }
}

// ============ PRINT REPORT FUNCTION ============
async function generatePrintReport() {
    if (!appState.currentSheet || !appState.currentData || appState.currentData.length < 2) {
        alert('⚠️ Tidak ada data untuk dicetak!');
        return;
    }

    // Show loading indicator
    const originalContent = document.body.innerHTML;
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000; text-align: center;';
    loadingDiv.innerHTML = '<div class="loading-spinner" style="margin: 0 auto 20px;"></div><div style="color: #FF69B4; font-weight: 600;">Menyiapkan laporan untuk dicetak...</div>';
    document.body.appendChild(loadingDiv);

    try {
        const storeName = appState.currentSheet;
        const currentDate = new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Get filtered data
        const allDataRows1 = appState.currentData.slice(1).filter(row => row[1]);
        const dataRows1 = filterDataByTriwulan(allDataRows1);
        
        const allDataRows2 = appState.currentData2.length > 1 ? appState.currentData2.slice(1).filter(row => row[0]) : [];
        const dataRows2 = appState.currentFilter !== 'all' 
            ? allDataRows2.filter(row => {
                const triwulan = row[0] ? row[0].toString().trim() : '';
                return triwulan === appState.currentFilter;
            })
            : allDataRows2;

        // Calculate totals
        const totals1 = calculateTotals(dataRows1);
        const totals2 = calculateTotalsTable2(dataRows2);

        const filterInfo = appState.currentFilter !== 'all' 
            ? `Filter: ${getTriwulanLabel(appState.currentFilter)}`
            : 'Menampilkan Semua Triwulan';

        // ✨ Generate chart images
        const chartImages = await generateChartImages(dataRows1, totals1);

        let printHTML = generatePrintHTML(storeName, currentDate, filterInfo, dataRows1, dataRows2, totals1, totals2, chartImages);

        // Remove loading indicator
        document.body.removeChild(loadingDiv);

        // Open print window
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printHTML);
            printWindow.document.close();
            
            printWindow.onload = function() {
                setTimeout(() => {
                    printWindow.print();
                }, 1000); // Increased delay to ensure charts are loaded
            };
        } else {
            alert('❌ Tidak dapat membuka window print. Pastikan popup tidak diblokir.');
        }
    } catch (error) {
        console.error('Error generating print report:', error);
        document.body.removeChild(loadingDiv);
        alert('❌ Terjadi kesalahan saat membuat laporan: ' + error.message);
    }
}

async function generateChartImages(dataRows, totals) {
    const chartImages = {};
    
    // Create temporary canvas elements
    const createTempCanvas = (width = 1000, height = 450) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    };

    try {
        // ✨ Chart 1: EBITDA LR by Month (LINE CHART)
        const canvas1 = createTempCanvas();
        const ctx1 = canvas1.getContext('2d');
        const chart1 = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: dataRows.map(row => row[1]),
                datasets: [{
                    label: 'EBITDA LR',
                    data: dataRows.map(row => parseNumber(row[2])),
                    backgroundColor: 'rgba(255, 105, 180, 0.1)',
                    borderColor: '#FF69B4',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#FF69B4',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: false,
                animation: false,
                layout: {
                    padding: {
                    left: 30,
                    right: 40,
                    top: 40,
                    bottom: 20
                    }
                    },
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { 
                        display: true, 
                        text: 'Trend EBITDA LR per Bulan', 
                        font: { size: 16, weight: 'bold' } 
                    },
                    datalabels: {
                        color: '#000',
                        font: { weight: 'bold', size: 10 },
                        formatter: (value) => formatRupiah(value),
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        clip: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => formatRupiah(value) }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        chartImages.chart1 = canvas1.toDataURL('image/png');
        chart1.destroy();

        // ✨ Chart 2: Laba Net vs Bayar Listrik (DUAL LINE CHART)
        const canvas2 = createTempCanvas();
        const ctx2 = canvas2.getContext('2d');
        const chart2 = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: dataRows.map(row => row[1]),
                datasets: [
                    {
                        label: 'Laba Net Ditransfer',
                        data: dataRows.map(row => parseNumber(row[4])),
                        backgroundColor: 'rgba(74, 144, 226, 0.1)',
                        borderColor: '#4A90E2',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#4A90E2',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: 'Bayar Listrik',
                        data: dataRows.map(row => parseNumber(row[5])),
                        backgroundColor: 'rgba(255, 165, 0, 0.1)',
                        borderColor: '#FFA500',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#FFA500',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: false,
                animation: false,
                layout: {
                    padding: {
                    left: 30,
                    right: 40,
                    top: 40,
                    bottom: 20
                    }
                    },
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { 
                        display: true, 
                        text: 'Perbandingan Laba Net Ditransfer vs Bayar Listrik', 
                        font: { size: 16, weight: 'bold' } 
                    },
                    datalabels: {
                        color: '#000',
                        font: { weight: 'bold', size: 9 },
                        formatter: (value) => formatRupiah(value),
                        anchor: 'end',
                        align: 'top',
                        offset: 6
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (value) => formatRupiah(value) }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        chartImages.chart2 = canvas2.toDataURL('image/png');
        chart2.destroy();

        // ✨ Chart 3: Sisa Surplus Kas (LINE CHART with area fill)
        const canvas3 = createTempCanvas();
        const ctx3 = canvas3.getContext('2d');
        
        // Determine colors based on positive/negative values
        const surkasData = dataRows.map(row => parseNumber(row[6]));
        const backgroundColors = surkasData.map(val => 
            val > 0 ? 'rgba(40, 167, 69, 0.15)' : 'rgba(220, 53, 69, 0.15)'
        );
        const borderColors = surkasData.map(val => 
            val > 0 ? '#28a745' : '#dc3545'
        );
        
        const chart3 = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: dataRows.map(row => row[1]),
                datasets: [{
                    label: 'Sisa Surplus Kas',
                    data: surkasData,
                    backgroundColor: 'rgba(40, 167, 69, 0.15)',
                    borderColor: '#28a745',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointBackgroundColor: surkasData.map(val => val > 0 ? '#28a745' : '#dc3545'),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    segment: {
                        borderColor: ctx => {
                            const value = ctx.p1.parsed.y;
                            return value < 0 ? '#dc3545' : '#28a745';
                        },
                        backgroundColor: ctx => {
                            const value = ctx.p1.parsed.y;
                            return value < 0 ? 'rgba(220, 53, 69, 0.15)' : 'rgba(40, 167, 69, 0.15)';
                        }
                    }
                }]
            },
            options: {
                responsive: false,
                animation: false,
                layout: {
                    padding: {
                    left: 30,
                    right: 40,
                    top: 40,
                    bottom: 20
                    }
                    },
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { 
                        display: true, 
                        text: 'Trend Sisa Surplus Kas (Positif/Negatif)', 
                        font: { size: 16, weight: 'bold' } 
                    },
                    datalabels: {
                        color: function(context) {
                            const value = context.dataset.data[context.dataIndex];
                            return value < 0 ? '#dc3545' : '#28a745';
                        },
                        font: { weight: 'bold', size: 10 },
                        formatter: (value) => formatRupiah(value),
                        anchor: function(context) {
                            const value = context.dataset.data[context.dataIndex];
                            return value < 0 ? 'end' : 'end';
                        },
                        align: function(context) {
                            const value = context.dataset.data[context.dataIndex];
                            return value < 0 ? 'bottom' : 'top';
                        },
                        offset: 8
                    }
                },
                scales: {
                    y: {
                        ticks: { 
                            callback: (value) => formatRupiah(value),
                            color: function(context) {
                                return context.tick.value < 0 ? '#dc3545' : '#28a745';
                            }
                        },
                        grid: {
                            color: function(context) {
                                return context.tick.value === 0 ? '#000' : 'rgba(0, 0, 0, 0.1)';
                            },
                            lineWidth: function(context) {
                                return context.tick.value === 0 ? 2 : 1;
                            }
                        }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        chartImages.chart3 = canvas3.toDataURL('image/png');
        chart3.destroy();

        // ✨ Chart 4: Distribution by Triwulan (PIE CHART - Keep this as is)
        const triwulanData = {};
        dataRows.forEach(row => {
            const tw = row[0] || 'Unknown';
            const value = parseNumber(row[6]); // Sisa Surkas
            triwulanData[tw] = (triwulanData[tw] || 0) + value;
        });

        const canvas4 = createTempCanvas(800, 450);
        const ctx4 = canvas4.getContext('2d');
        const chart4 = new Chart(ctx4, {
            type: 'pie',
            data: {
                labels: Object.keys(triwulanData).map(tw => `Triwulan ${tw}`),
                datasets: [{
                    data: Object.values(triwulanData),
                    backgroundColor: ['#FF69B4', '#4A90E2', '#FFA500', '#28a745', '#9C27B0']
                }]
            },
            options: {
                responsive: false,
                animation: false,
                layout: {
                    padding: {
                    left: 30,
                    right: 40,
                    top: 40,
                    bottom: 20
                    }
                    },
                plugins: {
                    legend: { display: true, position: 'right' },
                    title: { 
                        display: true, 
                        text: 'Distribusi Sisa Surkas per Triwulan', 
                        font: { size: 16, weight: 'bold' } 
                    },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 12 },
                        formatter: function(value, context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return percentage + '%\n' + formatRupiah(value);
                        },
                        anchor: 'center',
                        align: 'center',
                        textAlign: 'center'
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        chartImages.chart4 = canvas4.toDataURL('image/png');
        chart4.destroy();

    } catch (error) {
        console.error('Error generating chart images:', error);
    }

    return chartImages;
}

function generatePrintHTML(storeName, currentDate, filterInfo, dataRows1, dataRows2, totals1, totals2, chartImages) {
    let html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laporan Surplus Kas Toko - ${storeName}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 15mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #000;
        }
        
        .header-section {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #FF69B4;
        }
        
        .header-section h1 {
            font-size: 18pt;
            color: #FF69B4;
            margin-bottom: 5px;
        }
        
        .header-section .store-name {
            font-size: 14pt;
            font-weight: bold;
            color: #333;
            margin: 8px 0;
        }
        
        .header-section .meta-info {
            font-size: 10pt;
            color: #666;
            margin-top: 8px;
        }
        
        .header-section .filter-info {
            display: inline-block;
            background: #f0f0f0;
            padding: 5px 15px;
            border-radius: 15px;
            font-size: 9pt;
            font-weight: bold;
            color: #FF69B4;
            margin-top: 8px;
        }
        
        .section-title {
            background: linear-gradient(to right, #FF69B4, #4A90E2);
            color: white;
            padding: 10px 15px;
            font-size: 12pt;
            font-weight: bold;
            margin: 20px 0 10px 0;
            border-radius: 5px;
        }
        
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .summary-card {
            background: #f8f9fa;
            padding: 12px;
            border-left: 4px solid #FF69B4;
            border-radius: 5px;
        }
        
        .summary-card.finale {
            border-left-color: #28a745;
            background: #e8f5e9;
        }
        
        .summary-card .label {
            font-size: 8pt;
            color: #666;
            margin-bottom: 5px;
        }
        
        .summary-card .value {
            font-size: 12pt;
            font-weight: bold;
            color: #333;
        }
        
        .summary-card.finale .value {
            color: #28a745;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 8pt;
        }
        
        .data-table th {
            background: linear-gradient(to right, #FF69B4, #4A90E2);
            color: white;
            padding: 8px 6px;
            text-align: center;
            font-weight: bold;
            border: 1px solid #ddd;
            font-size: 8pt;
        }
        
        .data-table td {
            padding: 6px;
            border: 1px solid #ddd;
            text-align: left;
        }
        
        .data-table td.center {
            text-align: center;
        }
        
        .data-table td.right {
            text-align: right;
        }
        
        .data-table td.triwulan {
            text-align: center;
            font-weight: bold;
            background: #f8f9fa;
            color: #FF69B4;
        }
        
        .data-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        
        .data-table .positive {
            color: #28a745;
            font-weight: bold;
        }
        
        .data-table .negative {
            color: #dc3545;
            font-weight: bold;
        }
        
        .data-table .zero {
            color: #6c757d;
        }
        
        .chart-section {
            margin: 30px 0;
            page-break-inside: avoid;
        }
        
        .chart-container {
            text-align: center;
            margin: 20px 0;
            page-break-inside: avoid;
        }
        
        .chart-container img {
        width: 100%;
        max-width: 100%;
        height: auto;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        object-fit: contain;
        }
        
        .chart-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin: 20px 0;
        }
        
        .chart-item {
            text-align: center;
            page-break-inside: avoid;
        }
        
        .chart-item img {
            max-width: 100%;
            height: auto;
            border: 1px solid #e9ecef;
            border-radius: 8px;
        }
        
        .footer-section {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e9ecef;
        }
        
        .signature-area {
            display: flex;
            justify-content: space-around;
            margin-top: 40px;
            page-break-inside: avoid;
        }
        
        .signature-box {
            text-align: center;
            min-width: 200px;
        }
        
        .signature-box .title {
            font-weight: bold;
            margin-bottom: 60px;
            color: #333;
        }
        
        .signature-box .name {
            border-top: 2px solid #000;
            padding-top: 5px;
            font-weight: bold;
        }
        
        .footer-notes {
            font-size: 8pt;
            color: #666;
            text-align: center;
            margin-top: 20px;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        @media print {
            body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="header-section">
        <h1>📊 LAPORAN SURPLUS KAS TOKO</h1>
        <div class="store-name">Toko: ${storeName}</div>
        <div class="meta-info">
            <div>Tahun: ${appState.currentYear}</div>
            <div>Tanggal Cetak: ${currentDate}</div>
        </div>
        <div class="filter-info">${filterInfo}</div>
    </div>
    
    <!-- TABLE 1: SURPLUS KAS TOKO -->
    <div class="section-title">💰 SURPLUS KAS TOKO - TAHUN ${appState.currentYear}</div>
    
    <div class="summary-cards">
        <div class="summary-card">
            <div class="label">Total EBITDA LR</div>
            <div class="value">${formatRupiah(totals1.ebitdaLR)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Laba Net Ditransfer</div>
            <div class="value">${formatRupiah(totals1.labaNetDitransfer)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Bayar Listrik</div>
            <div class="value">${formatRupiah(totals1.bayarListrik)}</div>
        </div>
        <div class="summary-card finale">
            <div class="label">Total Sisa Surplus Kas</div>
            <div class="value">${formatRupiah(totals1.sisaSurkas)}</div>
        </div>
    </div>
    
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 8%;">TW</th>
                <th style="width: 12%;">BULAN</th>
                <th style="width: 15%;">EBITDA LR</th>
                <th style="width: 15%;">PENGGUNAAN LABA KAS</th>
                <th style="width: 15%;">LABA NET</th>
                <th style="width: 15%;">BAYAR LISTRIK</th>
                <th style="width: 20%;">SISA SURKAS</th>
            </tr>
        </thead>
        <tbody>
`;

    dataRows1.forEach((row) => {
        const data = processRowData(row);
        let colorClass = 'zero';
        if (data.sisaSurkas > 0) colorClass = 'positive';
        else if (data.sisaSurkas < 0) colorClass = 'negative';
        
        html += `
            <tr>
                <td class="triwulan">${data.triwulan}</td>
                <td>${data.bulan}</td>
                <td class="right">${formatRupiah(data.ebitdaLR)}</td>
                <td class="right">${formatRupiah(data.penggunaanLabaKas)}</td>
                <td class="right">${formatRupiah(data.labaNetDitransfer)}</td>
                <td class="right">${formatRupiah(data.bayarListrik)}</td>
                <td class="right ${colorClass}">${formatRupiah(data.sisaSurkas)}</td>
            </tr>
        `;
    });

    html += `
        </tbody>
    </table>
`;

    // ✨ ADD CHARTS SECTION
    if (chartImages && Object.keys(chartImages).length > 0) {
        html += `
    <div class="page-break"></div>
    <div class="section-title">📈 VISUALISASI DATA - GRAFIK ANALISIS</div>
    
    <div class="chart-section">
        <div class="chart-container">
            <img src="${chartImages.chart1}" alt="EBITDA LR Chart">
        </div>
        
        <div class="chart-container">
            <img src="${chartImages.chart2}" alt="Laba Net vs Listrik Chart">
        </div>
        
        <div class="chart-container">
            <img src="${chartImages.chart3}" alt="Sisa Surplus Kas Trend">
        </div>
        
        <div class="chart-container">
            <img src="${chartImages.chart4}" alt="Distribution Chart">
        </div>
    </div>
`;
    }

    // TABLE 2: PENGGUNAAN SURKAS
    if (dataRows2.length > 0) {
        html += `
    <div class="section-title page-break">📋 PENGGUNAAN SURPLUS KAS - TAHUN ${appState.currentYear}</div>
    
    <div class="summary-cards">
        <div class="summary-card">
            <div class="label">Total Nominal Penggunaan</div>
            <div class="value">${formatRupiah(totals2.nominalPenggunaanSurkas)}</div>
        </div>
        <div class="summary-card">
            <div class="label">Total Transaksi</div>
            <div class="value">${dataRows2.length}</div>
        </div>
    </div>
    
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 10%;">TW</th>
                <th style="width: 15%;">BULAN</th>
                <th style="width: 25%;">NOMINAL</th>
                <th style="width: 50%;">TUJUAN PENGGUNAAN</th>
            </tr>
        </thead>
        <tbody>
`;

        dataRows2.forEach((row) => {
            const data = processRowDataTable2(row);
            
            html += `
            <tr>
                <td class="center triwulan">${data.no}</td>
                <td>${data.bulan}</td>
                <td class="right">${formatRupiah(data.nominalPenggunaanSurkas)}</td>
                <td>${data.tujuanPenggunaanSurkas}</td>
            </tr>
            `;
        });

        html += `
        </tbody>
    </table>
`;
    }

    // Footer with signatures
    html += `
    <div class="footer-section">
        <div class="signature-area">
            <div class="signature-box">
                <div class="title">Disiapkan Oleh,</div>
                <div class="name">Manager Carang Sari Group</div>
            </div>
        </div>
        
        <div class="footer-notes">
            Dokumen ini dicetak secara otomatis dari SIMTOCS - Sistem Informasi Manajemen Toko Carang Sari<br>
            Dicetak pada: ${currentDate} | Termasuk visualisasi grafik analisis data
        </div>
    </div>
</body>
</html>
`;

    return html;
}

// ============ GENERATE COMPARISON PRINT SECTION ============
function generateComparisonPrintSection(storeData, triwulanFilter) {
    const triwulanLabel = triwulanFilter === 'all' ? 'Semua Triwulan' : getTriwulanLabel(triwulanFilter);
    
    // Sort stores by Sisa Surkas
    const sortedStoreData = [...storeData].sort((a, b) => b.totals1.sisaSurkas - a.totals1.sisaSurkas);
    
    // Calculate grand totals
    const grandTotals = storeData.reduce((acc, store) => ({
        ebitdaLR: acc.ebitdaLR + store.totals1.ebitdaLR,
        labaNetDitransfer: acc.labaNetDitransfer + store.totals1.labaNetDitransfer,
        bayarListrik: acc.bayarListrik + store.totals1.bayarListrik,
        sisaSurkas: acc.sisaSurkas + store.totals1.sisaSurkas,
        penggunaanSurkas: acc.penggunaanSurkas + store.totals2.nominalPenggunaanSurkas
    }), {
        ebitdaLR: 0,
        labaNetDitransfer: 0,
        bayarListrik: 0,
        sisaSurkas: 0,
        penggunaanSurkas: 0
    });
    
    const grandColorClass = grandTotals.sisaSurkas > 0 ? 'positive' : grandTotals.sisaSurkas < 0 ? 'negative' : 'zero';
    
    let html = `
    <div class="comparison-section page-break">
        <div class="section-title">📊 PERBANDINGAN ANTAR TOKO - TAHUN ${appState.currentYear}</div>
        <div style="text-align: center; margin-bottom: 15px;">
            <span style="display: inline-block; background: #f0f0f0; padding: 5px 15px; border-radius: 15px; font-size: 9pt; font-weight: bold; color: #9C27B0;">
                Filter: ${triwulanLabel}
            </span>
        </div>
        
        <!-- Summary Stats -->
        <div class="comparison-summary-grid">
            <div class="comparison-summary-card">
                <div class="icon">🏆</div>
                <div class="label">Toko Terbaik (Sisa Surkas)</div>
                <div class="value">${sortedStoreData[0].storeName}</div>
                <div class="amount ${sortedStoreData[0].totals1.sisaSurkas > 0 ? 'positive' : 'negative'}">
                    ${formatRupiah(sortedStoreData[0].totals1.sisaSurkas)}
                </div>
            </div>
            <div class="comparison-summary-card">
                <div class="icon">📈</div>
                <div class="label">Rata-rata Sisa Surkas</div>
                <div class="value">${formatRupiah(grandTotals.sisaSurkas / storeData.length)}</div>
            </div>
            <div class="comparison-summary-card">
                <div class="icon">💰</div>
                <div class="label">Total EBITDA Semua Toko</div>
                <div class="value">${formatRupiah(grandTotals.ebitdaLR)}</div>
            </div>
        </div>
        
        <!-- Comparison Table -->
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 15%;">TOKO</th>
                    <th style="width: 14%;">TOTAL EBITDA LR</th>
                    <th style="width: 14%;">TOTAL LABA NET</th>
                    <th style="width: 14%;">TOTAL BAYAR LISTRIK</th>
                    <th style="width: 14%;">TOTAL SISA SURKAS</th>
                    <th style="width: 14%;">TOTAL PENGGUNAAN SURKAS</th>
                    <th style="width: 15%;">JUMLAH BULAN</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sortedStoreData.forEach((store, index) => {
        const colorClass = store.totals1.sisaSurkas > 0 ? 'positive' : store.totals1.sisaSurkas < 0 ? 'negative' : 'zero';
        const rankBadge = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        
        html += `
            <tr>
                <td style="font-weight: 600;">${rankBadge} ${store.storeName}</td>
                <td class="right">${formatRupiah(store.totals1.ebitdaLR)}</td>
                <td class="right">${formatRupiah(store.totals1.labaNetDitransfer)}</td>
                <td class="right">${formatRupiah(store.totals1.bayarListrik)}</td>
                <td class="right ${colorClass}">${formatRupiah(store.totals1.sisaSurkas)}</td>
                <td class="right">${formatRupiah(store.totals2.nominalPenggunaanSurkas)}</td>
                <td class="center">${store.dataRows1.length}</td>
            </tr>
        `;
    });
    
    html += `
                <tr class="grand-total">
                    <td style="font-weight: 700;">TOTAL KESELURUHAN</td>
                    <td class="right">${formatRupiah(grandTotals.ebitdaLR)}</td>
                    <td class="right">${formatRupiah(grandTotals.labaNetDitransfer)}</td>
                    <td class="right">${formatRupiah(grandTotals.bayarListrik)}</td>
                    <td class="right ${grandColorClass}">${formatRupiah(grandTotals.sisaSurkas)}</td>
                    <td class="right">${formatRupiah(grandTotals.penggunaanSurkas)}</td>
                    <td class="center">-</td>
                </tr>
            </tbody>
        </table>
        
        <!-- Performance Analysis -->
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px;">
            <h4 style="color: #FF69B4; margin-bottom: 10px;">📊 Analisis Performa</h4>
            <table style="width: 100%; font-size: 9pt;">
                <tr>
                    <td style="padding: 5px; width: 40%;"><strong>Toko dengan EBITDA Tertinggi:</strong></td>
                    <td style="padding: 5px;">${[...storeData].sort((a, b) => b.totals1.ebitdaLR - a.totals1.ebitdaLR)[0].storeName} (${formatRupiah([...storeData].sort((a, b) => b.totals1.ebitdaLR - a.totals1.ebitdaLR)[0].totals1.ebitdaLR)})</td>
                </tr>
                <tr>
                    <td style="padding: 5px;"><strong>Toko dengan Bayar Listrik Terendah:</strong></td>
                    <td style="padding: 5px;">${[...storeData].sort((a, b) => a.totals1.bayarListrik - b.totals1.bayarListrik)[0].storeName} (${formatRupiah([...storeData].sort((a, b) => a.totals1.bayarListrik - b.totals1.bayarListrik)[0].totals1.bayarListrik)})</td>
                </tr>
                <tr>
                    <td style="padding: 5px;"><strong>Toko dengan Penggunaan Surkas Tertinggi:</strong></td>
                    <td style="padding: 5px;">${[...storeData].sort((a, b) => b.totals2.nominalPenggunaanSurkas - a.totals2.nominalPenggunaanSurkas)[0].storeName} (${formatRupiah([...storeData].sort((a, b) => b.totals2.nominalPenggunaanSurkas - a.totals2.nominalPenggunaanSurkas)[0].totals2.nominalPenggunaanSurkas)})</td>
                </tr>
                <tr>
                    <td style="padding: 5px;"><strong>Jumlah Toko Dibandingkan:</strong></td>
                    <td style="padding: 5px;">${storeData.length} Toko</td>
                </tr>
            </table>
        </div>
    </div>
    `;
    
    return html;
}

// ============ EVENT HANDLERS ============
function handleSheetChange() {
    const sheetSelect = document.getElementById('sheetSelect');
    const selectedSheet = sheetSelect.value;

    if (selectedSheet) {
        appState.currentFilter = 'all';
        
        const triwulanSelect = document.getElementById('triwulanFilter');
        if (triwulanSelect) {
            triwulanSelect.value = 'all';
            triwulanSelect.classList.remove('filtered');
        }
        
        saveLastSheet(selectedSheet);
        loadSheetData(selectedSheet);
    } else {
        showEmptyState();
    }
}

function handleRefresh() {
    const sheetSelect = document.getElementById('sheetSelect');
    const selectedSheet = sheetSelect.value;
    
    if (!selectedSheet) {
        alert('Pilih toko terlebih dahulu');
        return;
    }
    
    loadSheetData(selectedSheet, true);
}

function handleDelete(rowIndex, tableNumber) {
    if (!confirm('⚠️ Yakin ingin menghapus data ini?\n\nData yang dihapus tidak dapat dikembalikan!')) {
        return;
    }
    const yearOffset = appState.currentYear === '2026' ? 26 : 0;
    deleteRow(appState.currentSheet, rowIndex + yearOffset, tableNumber);  // ← ADD yearOffset here!
}

async function handleFormSubmit(event) {
    event.preventDefault();
    
    const editRowIndex = document.getElementById('editRowIndex').value;
    const tableNumber = parseInt(document.getElementById('editTableNumber').value) || 1;
    
    let rowData;
    
    if (tableNumber === 1) {
        const triwulan = document.getElementById('triwulan').value;
        const bulan = document.getElementById('bulan').value;
        const ebitdaLR = parseNumber(document.getElementById('ebitdaLR').value);
        const penggunaanLabaKas = parseNumber(document.getElementById('penggunaanLabaKas').value);
        const bayarListrik = parseNumber(document.getElementById('bayarListrik').value);
        const labaNetDitransfer = parseNumber(document.getElementById('labaNetDitransfer').value);
        const sisaSurkas = parseNumber(document.getElementById('sisaSurkas').value);

        rowData = [triwulan, bulan, ebitdaLR, penggunaanLabaKas, labaNetDitransfer, bayarListrik, sisaSurkas];
    } else {
        const no = document.getElementById('no2').value;
        const bulan = document.getElementById('bulan2').value;
        const nominalPenggunaanSurkas = parseNumber(document.getElementById('nominalPenggunaanSurkas').value);
        const tujuanPenggunaanSurkas = document.getElementById('tujuanPenggunaanSurkas').value;

        rowData = [no, bulan, nominalPenggunaanSurkas, tujuanPenggunaanSurkas];
    }

    // ✨ UPDATED: Pass tableNumber instead of range
    if (editRowIndex) {
        await updateRow(appState.currentSheet, parseInt(editRowIndex), rowData, tableNumber);
    } else {
        await addRow(appState.currentSheet, rowData, tableNumber);
    }
    
    closeModal();
}

// ============ INITIALIZATION ============
window.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, waiting for Google APIs...');
    
    startInactivityTimer();
    
    setTimeout(() => {
        if (typeof gapi !== 'undefined') {
            gapiLoaded();
        }
        if (typeof google !== 'undefined') {
            gisLoaded();
        }
    }, 500);
});

// ============ CHART VISUALIZATION ============
let currentChart = null;

function openVisualizationModal() {
    if (!appState.currentSheet || !appState.currentData || appState.currentData.length < 2) {
        alert('⚠️ Tidak ada data untuk divisualisasikan!');
        return;
    }
    
    document.getElementById('chartModal').classList.add('active');
    document.getElementById('chartModalTitle').textContent = `📊 Visualisasi Data - ${appState.currentSheet}`;
    
    setTimeout(() => {
        updateChart();
    }, 300);
}

function closeChartModal() {
    document.getElementById('chartModal').classList.remove('active');
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

function updateChart() {
    const chartType = document.getElementById('chartTypeSelect').value;
    const dataType = document.getElementById('chartDataSelect').value;
    
    const allDataRows = appState.currentData.slice(1).filter(row => row[1]);
    const dataRows = filterDataByTriwulan(allDataRows);
    
    if (dataRows.length === 0) {
        alert('Tidak ada data untuk filter yang dipilih');
        return;
    }
    
    const labels = dataRows.map(row => row[1]); // Bulan
    let data, label, backgroundColor;
    
    const dataMap = {
        'ebitdaLR': { index: 2, label: 'EBITDA LR', color: '#FF69B4' },
        'labaNetDitransfer': { index: 4, label: 'Laba Net Ditransfer', color: '#4A90E2' },
        'bayarListrik': { index: 5, label: 'Bayar Listrik', color: '#FFA500' },
        'sisaSurkas': { index: 6, label: 'Sisa Surplus Kas', color: '#28a745' }
    };
    
    const selectedData = dataMap[dataType];
    data = dataRows.map(row => parseNumber(row[selectedData.index]));
    label = selectedData.label;
    
    if (chartType === 'pie') {
        // Group by Triwulan for pie chart
        const triwulanData = {};
        dataRows.forEach(row => {
            const tw = row[0] || 'Unknown';
            const value = parseNumber(row[selectedData.index]);
            triwulanData[tw] = (triwulanData[tw] || 0) + value;
        });
        
        labels.length = 0;
        data.length = 0;
        Object.keys(triwulanData).forEach(tw => {
            labels.push(`Triwulan ${tw}`);
            data.push(triwulanData[tw]);
        });
        
        backgroundColor = ['#FF69B4', '#4A90E2', '#FFA500', '#28a745', '#9C27B0'];
    } else {
        backgroundColor = selectedData.color;
    }
    
    const ctx = document.getElementById('mainChart');
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    currentChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: backgroundColor,
                borderColor: chartType === 'line' ? backgroundColor : undefined,
                borderWidth: chartType === 'line' ? 3 : 1,
                fill: chartType === 'line' ? false : true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatRupiah(context.parsed.y || context.parsed);
                        }
                    }
                },
                // ✨ NEW: Data Labels Plugin Configuration
                datalabels: {
                    color: chartType === 'pie' ? '#fff' : '#000',
                    font: {
                        weight: 'bold',
                        size: chartType === 'pie' ? 11 : 10
                    },
                    formatter: function(value, context) {
                        // Format the value as Rupiah
                        return formatRupiah(value);
                    },
                    anchor: chartType === 'pie' ? 'center' : 'end',
                    align: chartType === 'pie' ? 'center' : 'top',
                    offset: chartType === 'pie' ? 0 : 4,
                    // For pie charts, show percentage as well
                    display: function(context) {
                        return context.dataset.data[context.dataIndex] > 0; // Only show if value > 0
                    }
                }
            },
            scales: chartType !== 'pie' ? {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatRupiah(value);
                        }
                    }
                }
            } : {}
        },
        plugins: [ChartDataLabels] // ✨ Enable the plugin
    });
}

// ============ STORE COMPARISON ============
function openComparisonModal() {
    if (appState.sheets.length === 0) {
        alert('⚠️ Tidak ada toko yang tersedia!');
        return;
    }
    
    const checkboxesContainer = document.getElementById('storeCheckboxes');
    checkboxesContainer.innerHTML = '';
    
    appState.sheets.forEach((sheet, index) => {
        const div = document.createElement('div');
        div.className = 'store-checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="store_${index}" value="${sheet}" ${sheet === appState.currentSheet ? 'checked' : ''}>
            <label for="store_${index}">${sheet}</label>
        `;
        checkboxesContainer.appendChild(div);
    });
    
    document.getElementById('comparisonModal').classList.add('active');
}

function closeComparisonModal() {
    document.getElementById('comparisonModal').classList.remove('active');
}

async function performComparison() {
    const checkboxes = document.querySelectorAll('#storeCheckboxes input[type="checkbox"]:checked');
    
    if (checkboxes.length < 2) {
        alert('⚠️ Pilih minimal 2 toko untuk dibandingkan!');
        return;
    }
    
    const selectedStores = Array.from(checkboxes).map(cb => cb.value);
    const selectedTriwulan = document.getElementById('comparisonTriwulanFilter').value;
    
    const resultsContainer = document.getElementById('comparisonResults');
    resultsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Memuat data perbandingan...</div></div>';
    
    try {
        const storeDataPromises = selectedStores.map(async (storeName) => {
            const ranges = CONFIG.YEAR_RANGES[appState.currentYear];
            const [response1, response2] = await Promise.all([
                fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(storeName)}!${ranges.table1}?key=${CONFIG.API_KEY}`),
                fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(storeName)}!${ranges.table2}?key=${CONFIG.API_KEY}`)
            ]);
            
            const data1 = await response1.json();
            const data2 = await response2.json();
            
            const table1Data = data1.values || [];
            const table2Data = data2.values || [];
            
            let dataRows1 = table1Data.slice(1).filter(row => row[1]);
            let dataRows2 = table2Data.slice(1).filter(row => row[0]);
            
            // Apply triwulan filter if not "all"
            if (selectedTriwulan !== 'all') {
                dataRows1 = dataRows1.filter(row => {
                    const triwulan = row[0] ? row[0].toString().trim() : '';
                    return triwulan === selectedTriwulan;
                });
                
                dataRows2 = dataRows2.filter(row => {
                    const triwulan = row[0] ? row[0].toString().trim() : '';
                    return triwulan === selectedTriwulan;
                });
            }
            
            const totals1 = calculateTotals(dataRows1);
            const totals2 = calculateTotalsTable2(dataRows2);
            
            return {
                storeName,
                totals1,
                totals2,
                dataRows1,
                dataRows2,
                triwulanFilter: selectedTriwulan
            };
        });
        
        const allStoreData = await Promise.all(storeDataPromises);
        
        displayComparisonResults(allStoreData, selectedTriwulan);
        
    } catch (error) {
        console.error('Error loading comparison data:', error);
        resultsContainer.innerHTML = `<div class="error"><strong>❌ Gagal memuat data perbandingan</strong>${error.message}</div>`;
    }
}

function displayComparisonResults(storeData, selectedTriwulan) {
    sessionStorage.setItem('lastComparisonData', JSON.stringify({
        storeData: storeData,
        triwulanFilter: selectedTriwulan,
        timestamp: Date.now()
    }));
    const triwulanLabel = selectedTriwulan === 'all' ? 'Semua Triwulan' : getTriwulanLabel(selectedTriwulan);
    
    let html = `
    <div class="comparison-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
            <h3 style="color: #FF69B4; margin-bottom: 10px;">📊 Hasil Perbandingan - Tahun ${appState.currentYear}</h3>
            <div class="filter-badge" style="display: inline-block; margin-bottom: 20px;">
                Filter: ${triwulanLabel}
            </div>
        </div>
        <button class="print-btn" onclick="generatePrintReport()" style="display: inline-flex;">
            <span>🖨️</span>
            <span>Cetak Laporan Lengkap</span>
        </button>
    </div>
        
        <!-- Comparison Table -->
        <div class="comparison-table">
            <table>
                <thead>
                    <tr>
                        <th>TOKO</th>
                        <th>TOTAL EBITDA LR</th>
                        <th>TOTAL LABA NET</th>
                        <th>TOTAL BAYAR LISTRIK</th>
                        <th>TOTAL SISA SURKAS</th>
                        <th>TOTAL PENGGUNAAN SURKAS</th>
                        <th>JUMLAH BULAN</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Sort stores by Sisa Surkas (highest to lowest)
    const sortedStoreData = [...storeData].sort((a, b) => b.totals1.sisaSurkas - a.totals1.sisaSurkas);
    
    sortedStoreData.forEach((store, index) => {
        const colorClass = store.totals1.sisaSurkas > 0 ? 'positive' : store.totals1.sisaSurkas < 0 ? 'negative' : 'zero';
        const rankBadge = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        
        html += `
            <tr>
                <td style="font-weight: 600;">${rankBadge} ${store.storeName}</td>
                <td class="currency">${formatRupiah(store.totals1.ebitdaLR)}</td>
                <td class="currency">${formatRupiah(store.totals1.labaNetDitransfer)}</td>
                <td class="currency">${formatRupiah(store.totals1.bayarListrik)}</td>
                <td class="currency ${colorClass}">${formatRupiah(store.totals1.sisaSurkas)}</td>
                <td class="currency">${formatRupiah(store.totals2.nominalPenggunaanSurkas)}</td>
                <td class="center">${store.dataRows1.length}</td>
            </tr>
        `;
    });
    
    // Calculate Grand Totals
    const grandTotals = storeData.reduce((acc, store) => ({
        ebitdaLR: acc.ebitdaLR + store.totals1.ebitdaLR,
        labaNetDitransfer: acc.labaNetDitransfer + store.totals1.labaNetDitransfer,
        bayarListrik: acc.bayarListrik + store.totals1.bayarListrik,
        sisaSurkas: acc.sisaSurkas + store.totals1.sisaSurkas,
        penggunaanSurkas: acc.penggunaanSurkas + store.totals2.nominalPenggunaanSurkas
    }), {
        ebitdaLR: 0,
        labaNetDitransfer: 0,
        bayarListrik: 0,
        sisaSurkas: 0,
        penggunaanSurkas: 0
    });
    
    const grandColorClass = grandTotals.sisaSurkas > 0 ? 'positive' : grandTotals.sisaSurkas < 0 ? 'negative' : 'zero';
    
    html += `
                <tr style="background: #f8f9fa; font-weight: 700; border-top: 3px solid #FF69B4;">
                    <td style="font-weight: 700;">TOTAL KESELURUHAN</td>
                    <td class="currency">${formatRupiah(grandTotals.ebitdaLR)}</td>
                    <td class="currency">${formatRupiah(grandTotals.labaNetDitransfer)}</td>
                    <td class="currency">${formatRupiah(grandTotals.bayarListrik)}</td>
                    <td class="currency ${grandColorClass}">${formatRupiah(grandTotals.sisaSurkas)}</td>
                    <td class="currency">${formatRupiah(grandTotals.penggunaanSurkas)}</td>
                    <td class="center">-</td>
                </tr>
                </tbody>
            </table>
        </div>
        
        <!-- Summary Stats -->
        <div class="comparison-summary-stats">
            <div class="comparison-stat-card">
                <div class="stat-icon">🏆</div>
                <div class="stat-label">Toko Terbaik (Sisa Surkas)</div>
                <div class="stat-value">${sortedStoreData[0].storeName}</div>
                <div class="stat-amount ${sortedStoreData[0].totals1.sisaSurkas > 0 ? 'positive' : 'negative'}">${formatRupiah(sortedStoreData[0].totals1.sisaSurkas)}</div>
            </div>
            <div class="comparison-stat-card">
                <div class="stat-icon">📈</div>
                <div class="stat-label">Rata-rata Sisa Surkas</div>
                <div class="stat-value">${formatRupiah(grandTotals.sisaSurkas / storeData.length)}</div>
            </div>
            <div class="comparison-stat-card">
                <div class="stat-icon">💰</div>
                <div class="stat-label">Total EBITDA Semua Toko</div>
                <div class="stat-value">${formatRupiah(grandTotals.ebitdaLR)}</div>
            </div>
        </div>
        
        <!-- Comparison Charts -->
        <div class="comparison-chart-grid">
    `;
    
    // Chart 1: EBITDA LR Comparison
    html += `
        <div class="comparison-chart-item">
            <h3>Perbandingan EBITDA LR</h3>
            <div class="comparison-chart-wrapper">
                <canvas id="compChart1"></canvas>
            </div>
        </div>
    `;
    
    // Chart 2: Sisa Surplus Kas Comparison
    html += `
        <div class="comparison-chart-item">
            <h3>Perbandingan Sisa Surplus Kas</h3>
            <div class="comparison-chart-wrapper">
                <canvas id="compChart2"></canvas>
            </div>
        </div>
    `;
    
    // Chart 3: Laba Net vs Bayar Listrik Comparison
    html += `
        <div class="comparison-chart-item">
            <h3>Laba Net vs Bayar Listrik</h3>
            <div class="comparison-chart-wrapper">
                <canvas id="compChart3"></canvas>
            </div>
        </div>
    `;
    
    // Chart 4: Penggunaan Surkas Comparison
    html += `
        <div class="comparison-chart-item">
            <h3>Perbandingan Penggunaan Surkas</h3>
            <div class="comparison-chart-wrapper">
                <canvas id="compChart4"></canvas>
            </div>
        </div>
    `;
    
    html += `</div>`;
    
    document.getElementById('comparisonResults').innerHTML = html;
    
    // Create charts after DOM is updated
    setTimeout(() => {
        createComparisonCharts(storeData);
    }, 100);
}

function createComparisonCharts(storeData) {
    const storeNames = storeData.map(s => s.storeName);
    const colors = ['#FF69B4', '#4A90E2', '#FFA500', '#28a745', '#9C27B0', '#E91E63', '#00BCD4', '#FFEB3B'];
    
    // Common data labels configuration
    const dataLabelsConfig = {
        color: '#000',
        font: {
            weight: 'bold',
            size: 10
        },
        formatter: function(value, context) {
            return formatRupiah(value);
        },
        anchor: 'end',
        align: 'top',
        offset: 4
    };
    
    // Chart 1: EBITDA LR
    new Chart(document.getElementById('compChart1'), {
        type: 'bar',
        data: {
            labels: storeNames,
            datasets: [{
                label: 'EBITDA LR',
                data: storeData.map(s => s.totals1.ebitdaLR),
                backgroundColor: colors.slice(0, storeData.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => formatRupiah(context.parsed.y)
                    }
                },
                datalabels: dataLabelsConfig
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatRupiah(value)
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
    
    // Chart 2: Sisa Surplus Kas
    new Chart(document.getElementById('compChart2'), {
        type: 'bar',
        data: {
            labels: storeNames,
            datasets: [{
                label: 'Sisa Surplus Kas',
                data: storeData.map(s => s.totals1.sisaSurkas),
                backgroundColor: storeData.map(s => s.totals1.sisaSurkas > 0 ? '#28a745' : '#dc3545'),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => formatRupiah(context.parsed.y)
                    }
                },
                datalabels: {
                    color: function(context) {
                        // White text for colored bars
                        return '#fff';
                    },
                    font: {
                        weight: 'bold',
                        size: 10
                    },
                    formatter: function(value) {
                        return formatRupiah(value);
                    },
                    anchor: 'center',
                    align: 'center'
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: (value) => formatRupiah(value)
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
    
    // Chart 3: Laba Net vs Bayar Listrik (Grouped Bar)
    new Chart(document.getElementById('compChart3'), {
        type: 'bar',
        data: {
            labels: storeNames,
            datasets: [
                {
                    label: 'Laba Net Ditransfer',
                    data: storeData.map(s => s.totals1.labaNetDitransfer),
                    backgroundColor: '#4A90E2',
                    borderWidth: 1
                },
                {
                    label: 'Bayar Listrik',
                    data: storeData.map(s => s.totals1.bayarListrik),
                    backgroundColor: '#FFA500',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => context.dataset.label + ': ' + formatRupiah(context.parsed.y)
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 9
                    },
                    formatter: function(value) {
                        return formatRupiah(value);
                    },
                    anchor: 'center',
                    align: 'center',
                    rotation: -90 // Rotate labels vertically for better readability
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatRupiah(value)
                    }
                }
            }
        },
        plugins: [ChartDataLabels]
    });
    
    // Chart 4: Penggunaan Surkas (Doughnut)
    new Chart(document.getElementById('compChart4'), {
        type: 'doughnut',
        data: {
            labels: storeNames,
            datasets: [{
                label: 'Penggunaan Surkas',
                data: storeData.map(s => s.totals2.nominalPenggunaanSurkas),
                backgroundColor: colors.slice(0, storeData.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'right' },
                tooltip: {
                    callbacks: {
                        label: (context) => context.label + ': ' + formatRupiah(context.parsed)
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: function(value, context) {
                        // Show percentage and value
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return percentage + '%\n' + formatRupiah(value);
                    },
                    anchor: 'center',
                    align: 'center',
                    textAlign: 'center'
                }
            }
        },
        plugins: [ChartDataLabels]
    });
}

// Add click handler for closing modals
window.onclick = function(event) {
    const dataModal = document.getElementById('dataModal');
    const chartModal = document.getElementById('chartModal');
    const comparisonModal = document.getElementById('comparisonModal');
    
    if (event.target === dataModal) {
        closeModal();
    }
    if (event.target === chartModal) {
        closeChartModal();
    }
    if (event.target === comparisonModal) {
        closeComparisonModal();
    }
}







