// ============ CONFIG ============
const CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    SPREADSHEET_ID: '1BUDa3SigMgbTfZf2rl1217kizSHSy57y6djhca91FKg',
    SHEET_NAME: 'Pengumuman',
};

// ============ GLOBAL STATE ============
let tokenClient;
let accessToken = null;
let gapiInited = false;
let gisInited = false;
let gapiLoading = false;
let gisLoading = false;
let announcementData = [];
let currentUserRole = null;

// ============ AUTH & UTILITY FUNCTIONS ============
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

function logout(message) {
    // Clear Google Auth token
    if (typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken() !== null) {
        try {
            google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
                console.log('OAuth token revoked');
            });
            gapi.client.setToken(null);
        } catch (e) {
            console.warn('Error revoking token:', e);
        }
    }
    clearStoredToken();
    deleteCookie('userAuth');
    window.location.href = 'login.html' + (message ? '?message=' + encodeURIComponent(message) : '');
}

function checkAuth() {
    const authData = getAuthData();
    if (!authData) {
        // REDIRECT TO LOGIN - User must be logged in
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return false;
    }
    
    // Check if session expired
    if (authData.expiresAt && new Date() > new Date(authData.expiresAt)) {
        deleteCookie('userAuth');
        window.location.href = 'login.html?message=' + encodeURIComponent('Session expired') + '&redirect=' + encodeURIComponent(window.location.pathname);
        return false;
    }
    
    // Update UI
    document.getElementById('displayUsername').textContent = authData.username;
    currentUserRole = authData.role;
    updateUIBasedOnRole(authData.role);
    return true;
}

function updateUIBasedOnRole(role) {
    const isAdmin = role && role.toLowerCase() === 'admin';
    const addBtn = document.getElementById('adminAnnouncementBtn');
    const authBtn = document.getElementById('authBtn');

    // Show Google Auth button only for Admin
    if (authBtn) {
        if (isAdmin) {
            authBtn.classList.add('show');
        } else {
            authBtn.classList.remove('show');
        }
    }

    // Show "Tambah Pengumuman" button only if Admin AND authenticated
    updateAddAnnouncementButton();
}

function updateAddAnnouncementButton() {
    const addBtn = document.getElementById('adminAnnouncementBtn');
    const isAdmin = currentUserRole && currentUserRole.toLowerCase() === 'admin';
    const isAuthenticated = accessToken !== null;

    if (addBtn) {
        if (isAdmin && isAuthenticated) {
            addBtn.classList.add('show');
        } else {
            addBtn.classList.remove('show');
        }
    }
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

const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
activityEvents.forEach(event => {
    window.addEventListener(event, resetInactivityTimer);
});

// ============ OAUTH TOKEN MANAGEMENT ============
function storeOAuthToken(token, expiresIn) {
    try {
        const expiryTime = Date.now() + (expiresIn * 1000);
        localStorage.setItem('oauth_token', token);
        localStorage.setItem('oauth_expiry', expiryTime.toString());
        accessToken = token;
    } catch (e) {
        console.warn('Could not save token to localStorage:', e);
    }
}

function restoreOAuthToken() {
    try {
        const token = localStorage.getItem('oauth_token');
        const expiry = localStorage.getItem('oauth_expiry');

        if (token && expiry && Date.now() < Number(expiry)) {
            accessToken = token;
            if (typeof gapi !== 'undefined' && gapi.client) {
                gapi.client.setToken({ access_token: accessToken });
            }
            updateAuthButton(true);
            return true;
        } else {
            clearStoredToken();
            updateAuthButton(false);
            return false;
        }
    } catch (e) {
        console.warn('Error restoring token:', e);
        clearStoredToken();
        return false;
    }
}

function clearStoredToken() {
    try {
        localStorage.removeItem('oauth_token');
        localStorage.removeItem('oauth_expiry');
        accessToken = null;
        updateAddAnnouncementButton(); // Hide add button when token cleared
    } catch (e) {
        console.warn('Error clearing token:', e);
    }
}

function updateAuthButton(isAuthenticated) {
    const authBtn = document.getElementById('authBtn');
    const authBtnText = document.getElementById('authBtnText');
    if (authBtn) {
        if (isAuthenticated) {
            authBtn.classList.add('authenticated');
            authBtnText.textContent = '✓ Terotentikasi';
        } else {
            authBtn.classList.remove('authenticated');
            authBtnText.textContent = 'Otentikasi';
        }
    }
    
    // Update "Tambah Pengumuman" button visibility
    updateAddAnnouncementButton();
}

// ============ GOOGLE API INITIALIZATION ============
function gapiLoaded() {
    console.log('📦 GAPI script loaded');
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
        console.log('✓ GAPI client initialized');
    } catch (error) {
        console.error('Error initializing GAPI client:', error);
    }
}

function gisLoaded() {
    console.log('📦 GIS script loaded');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
    console.log('✓ GIS client initialized');
}

async function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        console.log('✅ Both Google APIs ready');
        restoreOAuthToken();
        if (currentUserRole && currentUserRole.toLowerCase() === 'admin') {
            updateUIBasedOnRole(currentUserRole);
        }
    } else {
        console.log('⏳ Waiting for APIs... GAPI:', gapiInited, 'GIS:', gisInited);
    }
}

// Polling function to check if Google APIs are loaded
function waitForGoogleAPIs() {
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds total (50 * 200ms)
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        // Check if gapi is available
        if (typeof gapi !== 'undefined' && !gapiInited && !gapiLoading) {
        gapiLoading = true;
        gapiLoaded();
        }

        // Check if google.accounts is available
        if (typeof google !== 'undefined' && typeof google.accounts !== 'undefined' && !gisInited && !gisLoading) {
        gisLoading = true;
        gisLoaded();
        }
        
        // Stop checking if both are initialized or max attempts reached
        if ((gapiInited && gisInited) || attempts >= maxAttempts) {
            clearInterval(checkInterval);
            if (attempts >= maxAttempts && (!gapiInited || !gisInited)) {
                console.error('❌ Google APIs failed to load after 10 seconds');
                console.log('GAPI loaded:', gapiInited, 'GIS loaded:', gisInited);
            }
        }
    }, 200);
}

function handleAuth() {
    if (currentUserRole?.toLowerCase() !== 'admin') {
        alert('❌ Akses Ditolak. Hanya Admin yang dapat melakukan Google Sheets Authentication.');
        return;
    }
    
    if (!gapiInited || !gisInited) {
        alert('⏳ Tunggu sebentar, Google API masih memuat...\n\nSilakan coba lagi dalam beberapa detik.');
        console.warn('Auth attempted but APIs not ready. GAPI:', gapiInited, 'GIS:', gisInited);
        
        // Try to initialize again
        waitForGoogleAPIs();
        return;
    }
    
    if (accessToken) {
        alert('✅ Sudah terauthentikasi!');
        return;
    }

    tokenClient.callback = async (response) => {
        if (response.error !== undefined) {
            console.error('Auth error:', response);
            alert('❌ Gagal otentikasi: ' + response.error);
            clearStoredToken();
            updateAddAnnouncementButton(); // Hide add button on failure
            return;
        }
        
        accessToken = response.access_token;
        const expiresIn = response.expires_in || 3600;
        storeOAuthToken(accessToken, expiresIn);
        gapi.client.setToken({ access_token: accessToken });
        updateAuthButton(true); // This will also update add button visibility
        
        await displayAnnouncements();
        alert('✅ Berhasil otentikasi!');
        console.log('Authenticated successfully, token expires in:', expiresIn, 'seconds');
    };

    try {
        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({prompt: 'consent'});
        } else {
            tokenClient.requestAccessToken({prompt: ''});
        }
    } catch (error) {
        console.error('Error requesting access token:', error);
        alert('❌ Terjadi kesalahan saat meminta akses. Silakan refresh halaman dan coba lagi.');
    }
}

// ============ GOOGLE SHEETS CRUD FUNCTIONS ============
async function addRow(rowData) {
    if (!accessToken) {
        alert('❌ Harap otentikasi terlebih dahulu!\n\nKlik tombol "Otentikasi" di pojok kanan atas.');
        return;
    }
    
    if (currentUserRole?.toLowerCase() !== 'admin') {
        alert('❌ Akses Ditolak. Hanya pengguna Admin yang dapat menambah pengumuman.');
        return;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:D`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [rowData]
            }
        });
        console.log('Row added:', response);
        await loadAnnouncements();
        await displayAnnouncements();
        alert('✅ Pengumuman berhasil ditambahkan!');
        return response;
    } catch (error) {
        console.error('Error adding row:', error);
        alert('❌ Gagal menambahkan pengumuman: ' + (error.result?.error?.message || error.message));
        throw error;
    }
}

async function updateRow(rowIndex, rowData) {
    if (!accessToken) {
        alert('❌ Harap otentikasi terlebih dahulu!');
        return;
    }
    
    if (currentUserRole?.toLowerCase() !== 'admin') {
        alert('❌ Akses Ditolak. Hanya pengguna Admin yang dapat mengupdate pengumuman.');
        return;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A${rowIndex}:D${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [rowData]
            }
        });
        console.log('Row updated:', response);
        await loadAnnouncements();
        await displayAnnouncements();
        alert('✅ Pengumuman berhasil diupdate!');
        return response;
    } catch (error) {
        console.error('Error updating row:', error);
        alert('❌ Gagal mengupdate pengumuman: ' + (error.result?.error?.message || error.message));
        throw error;
    }
}

async function deleteRow(rowIndex) {
    if (!accessToken) {
        alert('❌ Harap otentikasi terlebih dahulu!');
        return;
    }
    
    if (currentUserRole?.toLowerCase() !== 'admin') {
        alert('❌ Akses Ditolak. Hanya pengguna Admin yang dapat menghapus pengumuman.');
        return;
    }
    
    if (!confirm(`⚠️ Anda yakin ingin menghapus pengumuman pada baris ke-${rowIndex}?`)) {
        return;
    }

    try {
        const spreadsheet = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });
        const sheet = spreadsheet.result.sheets.find(
            s => s.properties.title === CONFIG.SHEET_NAME
        );

        if (!sheet) {
            throw new Error(`Sheet '${CONFIG.SHEET_NAME}' tidak ditemukan.`);
        }
        const sheetId = sheet.properties.sheetId;

        const deleteRequest = {
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
        };

        const response = await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: deleteRequest
        });

        console.log('Row deleted:', response);
        await loadAnnouncements();
        await displayAnnouncements();
        alert('🗑️ Pengumuman berhasil dihapus!');
        return response;
    } catch (error) {
        console.error('Error deleting row:', error);
        alert('❌ Gagal menghapus pengumuman: ' + (error.result?.error?.message || error.message));
        throw error;
    }
}

// ============ ANNOUNCEMENT FUNCTIONS ============
async function loadAnnouncements() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    try {
        if (loadingSpinner) loadingSpinner.classList.add('show');
        
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.SHEET_NAME}?key=${CONFIG.API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (loadingSpinner) loadingSpinner.classList.remove('show');
        
        if (data.error) {
            console.error('API Error:', data.error);
            announcementData = [];
            return [];
        }
        
        if (!data.values || data.values.length <= 1) {
            announcementData = [];
            return [];
        }

        announcementData = data.values;

        return data.values.slice(1).map(row => ({
            type: row[0] || 'UMUM',
            title: row[1] || 'Judul Pengumuman',
            content: row[2] || 'Isi pengumuman tidak tersedia.',
            date: row[3] || ''
        }));
    } catch (error) {
        if (loadingSpinner) loadingSpinner.classList.remove('show');
        console.error('Error loading announcements:', error);
        return [];
    }
}

function formatAnnouncementDate(isoDate) {
    if (!isoDate) return 'Tanggal tidak diketahui';
    try {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const dateParts = isoDate.split('-');
        if (dateParts.length === 3) {
            return new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).toLocaleDateString('id-ID', options);
        }
        return new Date(isoDate).toLocaleDateString('id-ID', options);
    } catch (e) {
        return isoDate;
    }
}

async function displayAnnouncements() {
    if (sessionStorage.getItem('announcementsClosed') === 'true') return;
    const listContainer = document.getElementById('announcementsList');
    const board = document.getElementById('announcementBoard');
    const announcements = await loadAnnouncements();
    
    if (listContainer) listContainer.innerHTML = '';

    if (board) board.style.display = 'block';

    // Check if admin is authenticated for showing edit/delete buttons
    const isAdminAuthenticated = accessToken !== null && currentUserRole?.toLowerCase() === 'admin';
    
    // If no announcements, show empty state
    if (announcements.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'no-announcements';
        emptyDiv.innerHTML = `
            <div class="icon">📭</div>
            <p>Tidak ada pengumuman baru</p>
        `;
        if (listContainer) listContainer.appendChild(emptyDiv);
        return;
    }

    // Display all announcements
    announcements.forEach((item, index) => {
        const rowIndex = index + 2;

        const itemDiv = document.createElement('div');
        itemDiv.className = 'announcement-item';
        
        // Build the HTML with conditional action buttons
        let itemHTML = `
            <div class="announcement-content">
                <span class="announcement-type">${item.type}</span>
                <div class="announcement-title-text">${item.title}</div>
                <p style="white-space: pre-wrap;">${item.content}</p>
                <span class="announcement-date">Publikasi: ${formatAnnouncementDate(item.date)}</span>
            </div>
        `;
        
        // Only add action buttons if admin is authenticated
        if (isAdminAuthenticated) {
            itemHTML += `
                <div class="announcement-actions show">
                    <button class="btn-edit" onclick="openAnnouncementModal('edit', ${rowIndex})">✏️ Edit</button>
                    <button class="btn-delete" onclick="deleteRow(${rowIndex})">🗑️ Hapus</button>
                </div>
            `;
        }
        
        itemDiv.innerHTML = itemHTML;
        if (listContainer) listContainer.appendChild(itemDiv);
    });
}

function closeAnnouncements() {
    const board = document.getElementById('announcementBoard');
    if (board) board.style.display = 'none';
    sessionStorage.setItem('announcementsClosed', 'true');
}

function openAnnouncementModal(mode, rowIndex = null) {
    if (currentUserRole?.toLowerCase() !== 'admin') {
        alert('❌ Akses Ditolak. Hanya pengguna Admin yang dapat menambah/mengedit pengumuman.');
        return;
    }
    
    if (!accessToken) {
    alert('❌ Harap otentikasi GS API terlebih dahulu!');
    return;
    }

    const modal = document.getElementById('announcementModal');
    const form = document.getElementById('announcementForm');
    const modalTitle = document.getElementById('modalTitle');
    const submitBtnText = document.getElementById('submitBtnText');
    const editRowIndexInput = document.getElementById('editRowIndex');
    
    if (form) form.reset();
    if (editRowIndexInput) editRowIndexInput.value = '';

    if (mode === 'add') {
        if (modalTitle) modalTitle.textContent = 'Tambah Pengumuman Baru';
        if (submitBtnText) submitBtnText.textContent = 'Simpan';
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('date');
        if (dateInput) dateInput.value = today;
    } else if (mode === 'edit' && rowIndex !== null) {
        if (announcementData.length <= rowIndex) {
            alert('❌ Data pengumuman tidak ditemukan!');
            return;
        }
        
        const row = announcementData[rowIndex - 1];     
        
        if (modalTitle) modalTitle.textContent = 'Edit Pengumuman';
        if (submitBtnText) submitBtnText.textContent = 'Update';
        if (editRowIndexInput) editRowIndexInput.value = rowIndex;
        
        const typeInput = document.getElementById('type');
        const titleInput = document.getElementById('title');
        const contentInput = document.getElementById('content');
        const dateInput = document.getElementById('date');
        
        if (typeInput) typeInput.value = row[0] || 'UMUM';
        if (titleInput) titleInput.value = row[1] || '';
        if (contentInput) contentInput.value = row[2] || '';
        if (dateInput && row[3]) {
            try {
                dateInput.value = new Date(row[3]).toISOString().split('T')[0];
            } catch (e) {
                dateInput.value = row[3];
            }
        }
    }

    if (modal) modal.classList.add('active');
}

function closeAnnouncementModal() {
    const modal = document.getElementById('announcementModal');
    if (modal) modal.classList.remove('active');
}

async function handleAnnouncementSubmit(event) {
    event.preventDefault();
    
    if (currentUserRole?.toLowerCase() !== 'admin') {
        alert('❌ Akses Ditolak. Hanya pengguna Admin yang dapat memproses pengumuman.');
        closeAnnouncementModal();
        return;
    }

    const type = document.getElementById('type').value;
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;
    const date = document.getElementById('date').value;

    const rowData = [type, title, content, date];
    const editRowIndex = document.getElementById('editRowIndex').value;
    
    try {
        if (editRowIndex) {
            await updateRow(parseInt(editRowIndex), rowData);
        } else {
            await addRow(rowData);
        }
    } catch (e) {
        console.error('Submission failed:', e);
    }
    
    closeAnnouncementModal();
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Dashboard loading...');
    
    // Check authentication FIRST - redirect if not logged in
    const isAuthenticated = checkAuth();
    if (!isAuthenticated) {
        return; // Stop execution if redirected
    }

    // Start inactivity timer for logged-in users
    startInactivityTimer();

    // Start polling for Google APIs
    console.log('📡 Starting Google API initialization...');
    waitForGoogleAPIs();

    // Load announcements if not closed previously
    if (sessionStorage.getItem('announcementsClosed') !== 'true') {
        await new Promise(resolve => setTimeout(resolve, 500));
        await displayAnnouncements();
    }
});

// Form submission handler
const announcementForm = document.getElementById('announcementForm');
if (announcementForm) {
    announcementForm.addEventListener('submit', handleAnnouncementSubmit);
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('announcementModal');
    if (event.target === modal) {
        closeAnnouncementModal();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Target the SOP menu specifically by its ID
    const sopMenu = document.getElementById('sopMenu'); 
    
    if (sopMenu) {
        sopMenu.addEventListener('click', function(e) {
            e.preventDefault();
            alert("Mohon Maaf 🙏\n\nHalaman Standard Operating Procedure (SOP) sedang dalam tahap development.");
        });
    }
});
