// ============ CONFIG ============
const CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SPREADSHEET_ID: '1bcKwjW2Yq70Au9vV6Ql4k76qarny8q-5c_itxtBgzu0',
    SHEET_NAME: 'KaryawanToko',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    CACHE_DURATION: 5 * 60 * 1000
};

// ============ OAUTH STATE ============
let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

let allStores = [];
let filteredStores = [];
let appState = {
    cache: null,
    lastUpdate: null,
    currentData: []
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
    if (authData?.fullName) {
        document.getElementById('displayUsername').textContent = authData.fullName;
    } else if (authData?.username) {
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
            
            if (filteredStores.length > 0) {
                renderStores(filteredStores);
            }
            
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
        syncData();
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
function showLoading(message = 'Memuat data dari Database...') {
    document.getElementById('storeData').innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div class="loading-text">${message}</div>
        </div>
    `;
}

function showError(title, message) {
    document.getElementById('storeData').innerHTML = `
        <div class="error">
            <strong>❌ ${title}</strong>
            ${message}
        </div>
    `;
}

function updateSyncStatus(status, message) {
    const statusEl = document.getElementById('syncStatus');
    statusEl.className = `status ${status}`;
    
    const icon = status === 'online' ? '🟢' : status === 'connecting' ? '🟡' : '🔴';
    statusEl.innerHTML = `<span>${icon}</span><span>${message}</span>`;
}

function updateLastSync() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastSync').textContent = `Terakhir sync: ${timeStr}`;
    
    const updateTimeEl = document.getElementById('lastUpdateTime');
    updateTimeEl.style.display = 'block';
    updateTimeEl.innerHTML = `⏱️ Terakhir diperbarui: ${now.toLocaleString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })}`;
}

// ============ GOOGLE SHEETS API ============
async function fetchDataFromGoogleSheets(forceRefresh = false) {
    if (!forceRefresh && appState.cache) {
        const cacheAge = Date.now() - appState.lastUpdate;
        if (cacheAge < CONFIG.CACHE_DURATION) {
            console.log('Using cached data');
            processGoogleSheetsData(appState.cache);
            return;
        }
    }

    try {
        showLoading();
        updateSyncStatus('connecting', 'Menghubungkan ke Database...');

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_NAME}?key=${CONFIG.API_KEY}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('API Key tidak valid atau Google Sheets API belum di-enable');
            } else if (response.status === 404) {
                throw new Error('Spreadsheet atau Sheet tidak ditemukan');
            } else {
                throw new Error(`Error: ${response.status} - ${response.statusText}`);
            }
        }

        const data = await response.json();
        
        if (!data.values || data.values.length === 0) {
            throw new Error('Tidak ada data di spreadsheet');
        }

        appState.cache = data.values;
        appState.lastUpdate = Date.now();
        appState.currentData = data.values;

        processGoogleSheetsData(data.values);
        updateSyncStatus('online', 'Terhubung ke Database');
        updateLastSync();
        
    } catch (error) {
        console.error('Error fetching data:', error);
        updateSyncStatus('offline', 'Connection failed');
        showError('Gagal Memuat Data', `
            ${error.message}
            <br><br>
            <strong>Pastikan:</strong>
            <ul style="margin-top: 10px; margin-left: 20px;">
                <li>Spreadsheet ID benar</li>
                <li>API Key valid</li>
                <li>Google Sheets API sudah enabled</li>
                <li>Sheet sudah public</li>
                <li>Nama sheet sesuai</li>
            </ul>
        `);
    }
}

function processGoogleSheetsData(rows) {
    allStores = [];
    const dataRows = rows.slice(1);
    const storeMap = {};
    
    dataRows.forEach(row => {
        if (!row || row.length < 3) return;
        
        const storeName = row[0];
        const position = row[1];
        const name = row[2];
        
        if (!storeName || !name) return;
        
        if (!storeMap[storeName]) {
            let code = '';
            const codeMatch = storeName.match(/\(([^)]+)\)$/);
            if (codeMatch) {
                code = codeMatch[1];
            }
            
            storeMap[storeName] = {
                name: storeName.replace(/\s*\([^)]*\)$/, '').trim(),
                code: code,
                coordinator: { name: '', whatsapp: '' },
                employees: []
            };
        }
        
        if (position && position.toLowerCase().includes('kepala toko')) {
            storeMap[storeName].coordinator.name = name.trim();
            storeMap[storeName].coordinator.whatsapp = row[3] || '';
        } else {
            storeMap[storeName].employees.push({
                name: name.trim(),
                whatsapp: ''
            });
        }
    });
    
    allStores = Object.values(storeMap);
    console.log('Processed stores:', allStores);
    filteredStores = [...allStores];
    updateStats();
    renderStores(filteredStores);
}

function syncData() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('syncing');
    
    fetchDataFromGoogleSheets(true).finally(() => {
        btn.classList.remove('syncing');
    });
}

function updateStats() {
    const totalStores = allStores.length;
    const totalEmployees = allStores.reduce((sum, s) => {
        const kepalaCount = s.coordinator.name ? 1 : 0;
        return sum + s.employees.length + kepalaCount;
    }, 0);
   
    document.getElementById('totalStores').textContent = totalStores;
    document.getElementById('totalEmployees').textContent = totalEmployees;
}

function highlightText(text, searchTerm) {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<mark style="background: #ffeb3b; padding: 2px 4px; border-radius: 3px; font-weight: 600;">$1</mark>');
}

function renderStores(stores) {
    const container = document.getElementById('storeData');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (stores.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <div class="icon">🔍</div>
                <h3>Tidak ada data ditemukan</h3>
                <p>Coba ubah kata kunci pencarian Anda</p>
            </div>
        `;
        return;
    }

    const storeCards = stores.map((store, storeIdx) => {
        let employeesToShow = store.employees;
        if (searchTerm) {
            employeesToShow = store.employees.filter(emp => 
                emp.name.toLowerCase().includes(searchTerm)
            );
        }

        const employeeItems = employeesToShow.map((emp, empIdx) => `
            <div class="employee-item">
                <span class="employee-number">${empIdx + 1}</span>
                <span class="employee-name">${highlightText(emp.name, searchTerm)}</span>
                ${accessToken ? `
                <div class="employee-actions">
                    <button class="btn-edit-emp" onclick="openEditEmployeeModal(${storeIdx}, ${empIdx})" title="Edit">✏️</button>
                    <button class="btn-delete-emp" onclick="handleDeleteEmployee(${storeIdx}, ${empIdx})" title="Hapus">🗑️</button>
                </div>
                ` : ''}
            </div>
        `).join('');

        return `
            <div class="store-card">
                <div class="store-header">
                    ${accessToken ? `
                    <div class="store-actions">
                        <button class="btn-edit-store" onclick="openEditStoreModal(${storeIdx})">✏️</button>
                        <button class="btn-delete-store" onclick="handleDeleteStore(${storeIdx})">🗑️</button>
                    </div>
                    ` : ''}
                    <div class="store-title">
                        <h3>🏪 ${highlightText(store.name, searchTerm)}</h3>
                        ${store.code ? `<span class="store-code">${highlightText(store.code, searchTerm)}</span>` : ''}
                    </div>
                    ${store.coordinator.name ? `
                        <div class="store-info">
                            <div class="store-info-row">
                                <span class="icon">👔</span>
                                <span class="label">Kepala Toko:</span>
                                <span class="value">${highlightText(store.coordinator.name, searchTerm)}</span>
                            </div>
                            ${store.coordinator.whatsapp ? `
                                <div class="store-info-row">
                                    <span class="icon">📱</span>
                                    <span class="label">WhatsApp:</span>
                                    <span class="value">
                                        <a href="https://wa.me/${store.coordinator.whatsapp.replace(/\D/g, '')}" 
                                           target="_blank" 
                                           class="whatsapp-btn"
                                           title="Chat via WhatsApp">
                                            ${store.coordinator.whatsapp} 💬
                                        </a>
                                    </span>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
                <div class="store-body">
                    ${accessToken ? `
                    <button class="add-btn" onclick="openAddEmployeeModal(${storeIdx})" style="width: 100%; margin-bottom: 15px;">
                        <span>➕</span>
                        <span>Tambah Karyawan</span>
                    </button>
                    ` : ''}
                    ${employeesToShow.length > 0 ? `
                        <div class="employee-list">
                            ${employeeItems}
                        </div>
                    ` : '<p style="text-align: center; color: #999;">Belum ada karyawan</p>'}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="data-grid">${storeCards}</div>`;
}

function filterStores() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    filteredStores = allStores.filter(store => {
        const matchesName = store.name.toLowerCase().includes(searchTerm);
        const matchesCode = store.code.toLowerCase().includes(searchTerm);
        const matchesCoordinator = store.coordinator.name.toLowerCase().includes(searchTerm);
        const matchesEmployee = store.employees.some(emp => 
            emp.name.toLowerCase().includes(searchTerm)
        );
        
        return matchesName || matchesCode || matchesCoordinator || matchesEmployee;
    });

    sortStores();
}

function sortStores() {
    const sortBy = document.getElementById('sortBy').value;
    
    switch(sortBy) {
        case 'name-asc':
            filteredStores.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            filteredStores.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'default':
        default:
            filteredStores = allStores.filter(store => 
                filteredStores.some(fs => fs.code === store.code || fs.name === store.name)
            );
            break;
    }
    
    renderStores(filteredStores);
}

// ============ MODAL FUNCTIONS ============
function openAddStoreModal() {
    document.getElementById('storeModalTitle').textContent = 'Tambah Toko Baru';
    document.getElementById('storeSubmitBtnText').textContent = 'Simpan';
    document.getElementById('storeForm').reset();
    document.getElementById('editStoreIndex').value = '';
    document.getElementById('storeModal').classList.add('active');
}

function openEditStoreModal(storeIdx) {
    const store = filteredStores[storeIdx];
    
    document.getElementById('storeModalTitle').textContent = 'Edit Toko';
    document.getElementById('storeSubmitBtnText').textContent = 'Update';
    document.getElementById('editStoreIndex').value = storeIdx;
    
    document.getElementById('storeName').value = store.name;
    document.getElementById('storeCode').value = store.code;
    document.getElementById('coordinatorName').value = store.coordinator.name;
    document.getElementById('coordinatorWhatsapp').value = store.coordinator.whatsapp || '';
    
    document.getElementById('storeModal').classList.add('active');
}

function closeStoreModal() {
    document.getElementById('storeModal').classList.remove('active');
    document.getElementById('storeForm').reset();
}

function openAddEmployeeModal(storeIdx) {
    document.getElementById('employeeModalTitle').textContent = 'Tambah Karyawan';
    document.getElementById('employeeSubmitBtnText').textContent = 'Simpan';
    document.getElementById('employeeForm').reset();
    document.getElementById('employeeStoreIndex').value = storeIdx;
    document.getElementById('editEmployeeIndex').value = '';
    document.getElementById('employeeModal').classList.add('active');
}

function openEditEmployeeModal(storeIdx, empIdx) {
    const store = filteredStores[storeIdx];
    const employee = store.employees[empIdx];
    
    document.getElementById('employeeModalTitle').textContent = 'Edit Karyawan';
    document.getElementById('employeeSubmitBtnText').textContent = 'Update';
    document.getElementById('employeeStoreIndex').value = storeIdx;
    document.getElementById('editEmployeeIndex').value = empIdx;
    document.getElementById('employeeName').value = employee.name;
    
    document.getElementById('employeeModal').classList.add('active');
}

function closeEmployeeModal() {
    document.getElementById('employeeModal').classList.remove('active');
    document.getElementById('employeeForm').reset();
}

// ============ CRUD FUNCTIONS ============
async function handleStoreSubmit(event) {
    event.preventDefault();
    
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }

    const storeName = document.getElementById('storeName').value;
    const storeCode = document.getElementById('storeCode').value;
    const coordinatorName = document.getElementById('coordinatorName').value;
    const coordinatorWhatsapp = document.getElementById('coordinatorWhatsapp').value;
    const editStoreIndex = document.getElementById('editStoreIndex').value;

    const fullStoreName = storeCode ? `${storeName} (${storeCode})` : storeName;

    try {
        if (editStoreIndex !== '') {
            const store = filteredStores[parseInt(editStoreIndex)];
            await updateStoreInSheet(store, fullStoreName, coordinatorName, coordinatorWhatsapp);
        } else {
            const rowData = [fullStoreName, 'Kepala Toko', coordinatorName, coordinatorWhatsapp];
            await addRow(rowData);
        }
        
        closeStoreModal();
        syncData();
    } catch (error) {
        console.error('Error:', error);
    }
}

async function handleEmployeeSubmit(event) {
    event.preventDefault();
    
    if (!accessToken) {
        alert('❌ Harap authenticate terlebih dahulu!');
        return;
    }

    const storeIdx = parseInt(document.getElementById('employeeStoreIndex').value);
    const empIdx = document.getElementById('editEmployeeIndex').value;
    const employeeName = document.getElementById('employeeName').value;
    const store = filteredStores[storeIdx];

    const fullStoreName = store.code ? `${store.name} (${store.code})` : store.name;

    try {
        if (empIdx !== '') {
            await updateEmployeeInSheet(store, parseInt(empIdx), employeeName);
        } else {
            const rowData = [fullStoreName, 'Karyawan', employeeName];
            await addRow(rowData);
        }
        
        closeEmployeeModal();
        syncData();
    } catch (error) {
        console.error('Error:', error);
    }
}

async function addRow(rowData) {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:D`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [rowData]
            }
        });
        
        console.log('Row added:', response);
        alert('✅ Data berhasil ditambahkan!');
        return response;
    } catch (error) {
        console.error('Error adding row:', error);
        alert('❌ Gagal menambahkan data: ' + error.message);
        throw error;
    }
}

async function updateStoreInSheet(store, newStoreName, newCoordinatorName, newCoordinatorWhatsapp) {
    const rows = appState.currentData;
    const updates = [];
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const oldStoreName = store.code ? `${store.name} (${store.code})` : store.name;
        
        if (row[0] === oldStoreName) {
            if (row[1] && row[1].toLowerCase().includes('kepala toko')) {
                updates.push({
                    range: `${CONFIG.SHEET_NAME}!A${i + 1}:D${i + 1}`,
                    values: [[newStoreName, row[1], newCoordinatorName, newCoordinatorWhatsapp]]
                });
            } else {
                updates.push({
                    range: `${CONFIG.SHEET_NAME}!A${i + 1}`,
                    values: [[newStoreName]]
                });
            }
        }
    }

    if (updates.length > 0) {
        try {
            await gapi.client.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                resource: { data: updates, valueInputOption: 'USER_ENTERED' }
            });
            alert('✅ Toko berhasil diupdate!');
        } catch (error) {
            console.error('Error updating store:', error);
            alert('❌ Gagal mengupdate toko: ' + error.message);
            throw error;
        }
    }
}

async function updateEmployeeInSheet(store, empIdx, newEmployeeName) {
    const rows = appState.currentData;
    const oldStoreName = store.code ? `${store.name} (${store.code})` : store.name;
    let employeeCount = -1;
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] === oldStoreName && row[1] && !row[1].toLowerCase().includes('kepala toko')) {
            employeeCount++;
            if (employeeCount === empIdx) {
                try {
                    await gapi.client.sheets.spreadsheets.values.update({
                        spreadsheetId: CONFIG.SPREADSHEET_ID,
                        range: `${CONFIG.SHEET_NAME}!C${i + 1}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [[newEmployeeName]] }
                    });
                    alert('✅ Karyawan berhasil diupdate!');
                    return;
                } catch (error) {
                    console.error('Error updating employee:', error);
                    alert('❌ Gagal mengupdate karyawan: ' + error.message);
                    throw error;
                }
            }
        }
    }
}

async function handleDeleteStore(storeIdx) {
    if (!confirm('⚠️ Yakin ingin menghapus toko ini?\n\nSemua data karyawan di toko ini juga akan terhapus!')) {
        return;
    }

    const store = filteredStores[storeIdx];
    const oldStoreName = store.code ? `${store.name} (${store.code})` : store.name;

    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });
        
        const sheet = spreadsheet.result.sheets.find(
            s => s.properties.title === CONFIG.SHEET_NAME
        );
        
        if (!sheet) {
            throw new Error('Sheet not found');
        }
        
        const sheetId = sheet.properties.sheetId;
        const rows = appState.currentData;
        const deleteRequests = [];
        
        for (let i = rows.length - 1; i >= 1; i--) {
            if (rows[i][0] === oldStoreName) {
                deleteRequests.push({
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: i,
                            endIndex: i + 1
                        }
                    }
                });
            }
        }

        if (deleteRequests.length > 0) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: CONFIG.SPREADSHEET_ID,
                resource: { requests: deleteRequests }
            });
            
            alert('✅ Toko dan semua karyawannya berhasil dihapus!');
            syncData();
        }
    } catch (error) {
        console.error('Error deleting store:', error);
        alert('❌ Gagal menghapus toko: ' + error.message);
        throw error;
    }
}

async function handleDeleteEmployee(storeIdx, empIdx) {
    if (!confirm('⚠️ Yakin ingin menghapus karyawan ini?')) {
        return;
    }

    const store = filteredStores[storeIdx];
    const oldStoreName = store.code ? `${store.name} (${store.code})` : store.name;

    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });
        
        const sheet = spreadsheet.result.sheets.find(
            s => s.properties.title === CONFIG.SHEET_NAME
        );
        
        if (!sheet) {
            throw new Error('Sheet not found');
        }
        
        const sheetId = sheet.properties.sheetId;
        const rows = appState.currentData;
        let employeeCount = -1;
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[0] === oldStoreName && row[1] && !row[1].toLowerCase().includes('kepala toko')) {
                employeeCount++;
                if (employeeCount === empIdx) {
                    await gapi.client.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: CONFIG.SPREADSHEET_ID,
                        resource: {
                            requests: [{
                                deleteDimension: {
                                    range: {
                                        sheetId: sheetId,
                                        dimension: 'ROWS',
                                        startIndex: i,
                                        endIndex: i + 1
                                    }
                                }
                            }]
                        }
                    });
                    
                    alert('✅ Karyawan berhasil dihapus!');
                    syncData();
                    return;
                }
            }
        }
    } catch (error) {
        console.error('Error deleting employee:', error);
        alert('❌ Gagal menghapus karyawan: ' + error.message);
        throw error;
    }
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

    fetchDataFromGoogleSheets();
    
    setInterval(() => {
        console.log('Auto-syncing data...');
        fetchDataFromGoogleSheets(true);
    }, 5 * 60 * 1000);
});

window.onclick = function(event) {
    const storeModal = document.getElementById('storeModal');
    const employeeModal = document.getElementById('employeeModal');
    
    if (event.target === storeModal) {
        closeStoreModal();
    }
    if (event.target === employeeModal) {
        closeEmployeeModal();
    }
}
