// ============ CONFIG ============
const AKTIVA_CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SPREADSHEET_ID: '1rRwjnxKKsKXn4gYGhld8HqcYH3ycU7wz1b3sk_UFMko',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    CACHE_DURATION: 5 * 60 * 1000,
    RANGE: 'A1:E200'
};

// ============ OAUTH STATE ============
let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

// ============ STATE ============
let aktivaState = {
    currentStore: null,
    cache: {},
    lastUpdate: null,
    currentData: [],
    currentFilter: 'all',
    allCategories: []
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
        if (countdown <= 0) clearInterval(countdownInterval);
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

// Initialize auth on page load
if (checkAuth()) {
    const authData = getAuthData();
    if (authData?.username) {
        document.getElementById('displayUsername').textContent = authData.username;
    }
    if (authData?.role) {
        updateUIBasedOnRole(authData.role);
    }
    startInactivityTimer();
}

// ============ OAUTH INITIALIZATION ============
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: AKTIVA_CONFIG.API_KEY,
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
        });
        gapiInited = true;
        maybeEnableButtons();
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
        client_id: AKTIVA_CONFIG.CLIENT_ID,
        scope: AKTIVA_CONFIG.SCOPES,
        prompt: '',
        callback: ''
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        console.log('Both APIs ready');
        console.log('Stored token:', localStorage.getItem('oauth_token'));
        console.log('Token expiry:', localStorage.getItem('oauth_expiry'));
        if (restoreStoredToken()) {
            console.log('Token restored successfully');
        }
    }
}

// ============ TOKEN STORAGE ============
function storeOAuthToken(token, expiresIn = 3600) {
    try {
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('oauth_token', token);
        localStorage.setItem('oauth_expiry', expiryTime.toString());
    } catch (e) {
        console.warn('Could not store OAuth token:', e);
    }
}

function restoreStoredToken() {
    try {
        const storedToken = localStorage.getItem('oauth_token');
        const expiry = localStorage.getItem('oauth_expiry');
        if (!storedToken || !expiry) return false;
        const expiryTime = parseInt(expiry);
        const now = Date.now();
        if (now < expiryTime - 300000) {
            accessToken = storedToken;
            gapi.client.setToken({ access_token: storedToken });
            updateAuthButton(true);
            return true;
        } else {
            clearStoredToken();
            return false;
        }
    } catch (e) {
        return false;
    }
}

function clearStoredToken() {
    try {
        localStorage.removeItem('oauth_token');
        localStorage.removeItem('oauth_expiry');
    } catch (e) {}
}

function handleAuth() {
    if (!gapiInited || !gisInited) {
        // Wait up to 5 seconds for Google API to be ready
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            if (gapiInited && gisInited) {
                clearInterval(interval);
                handleAuth();
            } else if (attempts >= 10) {
                clearInterval(interval);
                alert('Google API gagal dimuat. Silakan refresh halaman.');
            }
        }, 500);
        return;
    }

    if (accessToken) {
        alert('Sudah terauthentikasi!');
        return;
    }

    tokenClient.callback = async (response) => {
        if (response.error !== undefined) {
            alert('Gagal authenticate: ' + response.error);
            clearStoredToken();
            return;
        }
        accessToken = response.access_token;
        storeOAuthToken(accessToken, response.expires_in || 3600);
        gapi.client.setToken({ access_token: accessToken });
        updateAuthButton(true);
        if (aktivaState.currentStore) {
            loadAktivaData(true);
        }
        alert('✅ Berhasil authenticate! Sekarang Anda bisa menambah, edit, dan hapus data.');
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
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
        authBtnText.textContent = 'Otentikasi';
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
            <div class="empty-state-icon">🏢</div>
            <h2>Pilih Toko untuk Melihat Data Aktiva</h2>
            <p>Gunakan dropdown di atas untuk memilih cabang toko yang ingin ditampilkan</p>
        </div>
    `;
}

// ============ CACHE ============
function getCachedData(key) {
    const cached = aktivaState.cache[key];
    if (!cached) return null;
    if (Date.now() - cached.timestamp > AKTIVA_CONFIG.CACHE_DURATION) {
        delete aktivaState.cache[key];
        return null;
    }
    return cached.data;
}

function setCachedData(key, data) {
    aktivaState.cache[key] = { data, timestamp: Date.now() };
}

// ============ LOAD DATA ============
async function loadAktivaData(forceRefresh = false) {
    const store = document.getElementById('storeSelect').value;
    if (!store) {
        showEmptyState();
        return;
    }

    aktivaState.currentStore = store;
    const cacheKey = `aktiva_${store}`;

    if (!forceRefresh) {
        const cached = getCachedData(cacheKey);
        if (cached) {
            displayAktivaData(cached, store);
            return;
        }
    }

    showLoading(`Memuat data aktiva: ${store}`);

    try {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${AKTIVA_CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(store)}!${AKTIVA_CONFIG.RANGE}?key=${AKTIVA_CONFIG.API_KEY}`
        );
        const data = await response.json();

        if (data.error) throw new Error(data.error.message);

        const rows = data.values || [];
        if (rows.length === 0) {
            showError('Data Kosong', `Tidak ada data aktiva di sheet "${store}"`);
            return;
        }

        setCachedData(cacheKey, rows);
        aktivaState.currentData = rows;
        aktivaState.lastUpdate = new Date();

        displayAktivaData(rows, store);

    } catch (err) {
        console.error('Sheet Error:', err);
        showError('Gagal Memuat Data', `${err.message}<br><br><strong>Toko:</strong> "${store}"`);
    }
}

function handleRefresh() {
    if (aktivaState.currentStore) {
        loadAktivaData(true);
    }
}

// ============ DISPLAY DATA ============
function displayAktivaData(rows, storeName) {
    // Parse rows: detect category headers vs data rows
    const parsed = parseRows(rows);

    // Build category list for filter dropdown
    const categories = ['all', ...new Set(parsed.filter(r => r.isCategory).map(r => r.label))];
    aktivaState.allCategories = categories;
    populateCategoryFilter(categories);

    // Apply filter
    const filtered = applyFilter(parsed, aktivaState.currentFilter);

    // Calculate stats
    const dataRows = parsed.filter(r => !r.isCategory);
    const totalItems = dataRows.length;
    const totalBiaya = dataRows.reduce((sum, r) => sum + r.biayaPerolehan, 0);
    const totalJumlah = dataRows.reduce((sum, r) => sum + r.jumlah, 0);
    const totalCategories = categories.length - 1; // minus 'all'

    const isAdmin = (() => {
        const authData = getAuthData();
        return authData && authData.role && authData.role.toLowerCase() === 'admin';
    })();

    const lastUpdateStr = aktivaState.lastUpdate
        ? aktivaState.lastUpdate.toLocaleTimeString('id-ID')
        : '-';

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
            <div>
                <h2 style="color:#FF69B4; font-size:1.5em;">📋 Aktiva Toko: ${storeName}</h2>
                <small style="color:#6c757d;">Diperbarui: ${lastUpdateStr}</small>
            </div>
            ${isAdmin ? `<button class="add-btn" onclick="openAddModal()"><span>➕</span><span>Tambah Aktiva</span></button>` : ''}
        </div>

        <div class="stats">
            <div class="stat-card">
                <h3>${totalItems}</h3>
                <p>Total Item Aktiva</p>
            </div>
            <div class="stat-card">
                <h3>${totalJumlah}</h3>
                <p>Total Jumlah Unit</p>
            </div>
            <div class="stat-card">
                <h3>${totalCategories}</h3>
                <p>Kategori Aktiva</p>
            </div>
            <div class="stat-card-finale">
                <h3>${formatRupiah(totalBiaya)}</h3>
                <p>Total Biaya Perolehan</p>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Nama Item</th>
                        <th>Tanggal Beli</th>
                        <th>Jumlah</th>
                        <th>Biaya Perolehan</th>
                        ${isAdmin ? '<th>Aksi</th>' : ''}
                    </tr>
                </thead>
                <tbody>
    `;

    filtered.forEach((row, idx) => {
        if (row.isCategory) {
            const colspan = isAdmin ? 6 : 5;
            html += `<tr class="category-row"><td colspan="${colspan}">📁 ${row.label}</td></tr>`;
        } else {
            html += `
                <tr>
                    <td style="text-align:center;">${row.no || (idx + 1)}</td>
                    <td>${row.namaItem || '-'}</td>
                    <td style="text-align:center;">${row.tanggalBeli || '-'}</td>
                    <td style="text-align:center;">${row.jumlah || '0'}</td>
                    <td class="currency positive">${formatRupiah(row.biayaPerolehan)}</td>
                    ${isAdmin ? `
                    <td class="actions">
                        <button class="btn-edit" onclick="openEditModal(${row.originalIndex})">✏️ Edit</button>
                        <button class="btn-delete" onclick="deleteRow(${row.originalIndex})">🗑️ Hapus</button>
                    </td>` : ''}
                </tr>
            `;
        }
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('content').innerHTML = html;
}

function populateKategoriDropdown(selectedValue = '') {
    const select = document.getElementById('kategori');
    const categories = aktivaState.allCategories.filter(c => c !== 'all');
    select.innerHTML = `<option value="">-- Pilih Kategori --</option>` +
        categories.map(cat =>
            `<option value="${cat}" ${cat === selectedValue ? 'selected' : ''}>${cat}</option>`
        ).join('');
}

// ============ ROW PARSING ============
function parseRows(rows) {
    const parsed = [];
    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Category: row has content only in first 1-2 cols and no biaya column
        if ((!row[2] && !row[3] && !row[4]) && (row[0] || row[1])) {
            parsed.push({
                isCategory: true,
                label: row[0] || row[1],
                originalIndex: i
            });
        } else if (row.length >= 2 && (row[0] || row[1])) {
            parsed.push({
                isCategory: false,
                no: row[0],
                namaItem: row[1] || '-',
                tanggalBeli: row[2] || '-',
                jumlah: parseNumber(row[3]),
                biayaPerolehan: parseNumber(row[4]),
                originalIndex: i
            });
        }
    }
    return parsed;
}

// ============ FILTER ============
function populateCategoryFilter(categories) {
    const select = document.getElementById('categoryFilter');
    select.innerHTML = categories.map(cat =>
        `<option value="${cat}">${cat === 'all' ? 'Semua Kategori' : cat}</option>`
    ).join('');
    select.value = aktivaState.currentFilter;
}

function handleCategoryFilter() {
    aktivaState.currentFilter = document.getElementById('categoryFilter').value;
    if (aktivaState.currentData.length > 0) {
        displayAktivaData(aktivaState.currentData, aktivaState.currentStore);
    }
}

function applyFilter(parsed, filter) {
    if (filter === 'all') return parsed;

    const result = [];
    let inTarget = false;

    for (const row of parsed) {
        if (row.isCategory) {
            inTarget = row.label === filter;
            if (inTarget) result.push(row);
        } else if (inTarget) {
            result.push(row);
        }
    }
    return result;
}

// ============ MODAL ============
function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Tambah Data Aktiva';
    document.getElementById('submitBtnText').textContent = 'Simpan';
    document.getElementById('editRowIndex').value = '';
    document.getElementById('dataForm').reset();
    populateKategoriDropdown();
    document.getElementById('dataModal').classList.add('show');
}

function openEditModal(rowIndex) {
    const rows = aktivaState.currentData;
    const row = rows[rowIndex];
    if (!row) return;

    document.getElementById('modalTitle').textContent = 'Edit Data Aktiva';
    document.getElementById('submitBtnText').textContent = 'Update';
    document.getElementById('editRowIndex').value = rowIndex;

    document.getElementById('namaItem').value = row[1] || '';
    document.getElementById('tanggalBeli').value = row[2] || '';
    document.getElementById('jumlah').value = parseNumber(row[3]) || '';
    document.getElementById('biayaPerolehan').value = parseNumber(row[4]) || '';
    populateKategoriDropdown(row[5] || ''); // ← replace the old kategori line
    
    document.getElementById('dataModal').classList.add('show');
}

function closeModal() {
    document.getElementById('dataModal').classList.remove('show');
    document.getElementById('dataForm').reset();
}

async function handleFormSubmit(event) {
    event.preventDefault();

    if (!accessToken) {
        alert('⚠️ Silakan otentikasi terlebih dahulu untuk menyimpan data.');
        return;
    }

    const rowIndex = document.getElementById('editRowIndex').value;
    const namaItem = document.getElementById('namaItem').value;
    const tanggalBeli = document.getElementById('tanggalBeli').value;
    const jumlah = document.getElementById('jumlah').value;
    const biayaPerolehan = document.getElementById('biayaPerolehan').value;
    const kategori = document.getElementById('kategori').value;

    const rowData = ['', namaItem, tanggalBeli, jumlah, biayaPerolehan, kategori];

    try {
        const store = aktivaState.currentStore;

        if (rowIndex !== '') {
            // Edit mode: update existing row
            const sheetRowNumber = parseInt(rowIndex) + 1; // 1-based
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: AKTIVA_CONFIG.SPREADSHEET_ID,
                range: `${store}!A${sheetRowNumber}:F${sheetRowNumber}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
            alert('✅ Data berhasil diperbarui!');
        } else {
            // Add mode: append row
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: AKTIVA_CONFIG.SPREADSHEET_ID,
                range: `${store}!A:F`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [rowData] }
            });
            alert('✅ Data berhasil ditambahkan!');
        }

        closeModal();
        loadAktivaData(true);

    } catch (err) {
        console.error('Save error:', err);
        alert('❌ Gagal menyimpan data: ' + (err.result?.error?.message || err.message));
    }
}

async function deleteRow(rowIndex) {
    if (!accessToken) {
        alert('⚠️ Silakan otentikasi terlebih dahulu untuk menghapus data.');
        return;
    }

    if (!confirm('Yakin ingin menghapus data ini?')) return;

    try {
        // Get spreadsheet to find sheet ID
        const spreadsheetResponse = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: AKTIVA_CONFIG.SPREADSHEET_ID
        });
        const sheets = spreadsheetResponse.result.sheets;
        const sheet = sheets.find(s => s.properties.title === aktivaState.currentStore);
        if (!sheet) throw new Error('Sheet tidak ditemukan');

        const sheetId = sheet.properties.sheetId;

        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: AKTIVA_CONFIG.SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: rowIndex,
                            endIndex: rowIndex + 1
                        }
                    }
                }]
            }
        });

        alert('✅ Data berhasil dihapus!');
        loadAktivaData(true);

    } catch (err) {
        console.error('Delete error:', err);
        alert('❌ Gagal menghapus data: ' + (err.result?.error?.message || err.message));
    }
}

// Close modal on outside click
window.onclick = function (event) {
    const dataModal = document.getElementById('dataModal');
    if (event.target === dataModal) {
        closeModal();
    }
};
