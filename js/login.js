// Config
var CONFIG = {
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SPREADSHEET_ID: '1bcKwjW2Yq70Au9vV6Ql4k76qarny8q-5c_itxtBgzu0',
    SHEET_NAME: 'Users'
};

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

console.log('Login.js loaded');

// COOKIE FUNCTIONS
function setCookie(name, value, days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length);
    }
    return null;
}

// UI FUNCTIONS
function togglePassword() {
    var passwordInput = document.getElementById('password');
    var toggleBtn = document.getElementById('togglePasswordBtn');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = '👁️';
    }
}

function showMessage(message, type) {
    var messageDiv = document.getElementById('message');
    messageDiv.textContent = message;
    messageDiv.className = 'message ' + type + ' show';
    
    setTimeout(function() {
        messageDiv.classList.remove('show');
    }, 5000);
}

function setLoading(isLoading) {
    var loginBtn = document.getElementById('loginBtn');
    var btnText = document.getElementById('btnText');
    var loadingOverlay = document.getElementById('loadingOverlay');
    
    if (isLoading) {
        loginBtn.disabled = true;
        btnText.innerHTML = 'Memverifikasi<span class="loading-spinner"></span>';
        loadingOverlay.classList.add('active');
    } else {
        loginBtn.disabled = false;
        btnText.textContent = '🚀 Masuk ke SIMTOCS';
        loadingOverlay.classList.remove('active');
    }
}

// LOGIN HANDLER
async function handleLogin(event) {
    event.preventDefault();
    console.log('Login started');
    
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value.trim();
    var hashedPassword = await hashPassword(password);
    
    if (!username || !password) {
        showMessage('Username dan password harus diisi!', 'error');
        return;
    }

    if (username.length < 3) {
        showMessage('Username minimal 3 karakter!', 'error');
        return;
    }

    if (password.length < 4) {
        showMessage('Password minimal 4 karakter!', 'error');
        return;
    }
    
    setLoading(true);
    
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SPREADSHEET_ID + '/values/' + CONFIG.SHEET_NAME + '?key=' + CONFIG.API_KEY;
    
    fetch(url)
        .then(function(response) {
            if (!response.ok) {
                throw new Error('Gagal terhubung ke server');
            }
            return response.json();
        })
        .then(function(data) {
            if (data.error) {
                throw new Error('Gagal mengakses database');
            }
            
            if (!data.values || data.values.length === 0) {
                throw new Error('Database kosong');
            }
            
            var users = data.values.slice(1);
            var validUser = null;
            
            for (var i = 0; i < users.length; i++) {
                var user = users[i];
                if (user[0] && user[0].trim().toLowerCase() === username.toLowerCase() && user[1] && user[1].trim() === hashedPassword) {
                    validUser = user;
                    break;
                }
            }
            
            if (validUser) {
                console.log('Login berhasil');
                
                var authData = {
                    username: username,
                    fullName: validUser[2] || username,
                    role: validUser[3] || 'user',
                    loginTime: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                };
                
                var encoded = btoa(JSON.stringify(authData));
                setCookie('userAuth', encoded, 1);
                
                var urlParams = new URLSearchParams(window.location.search);
                var redirectParam = urlParams.get('redirect');
                var redirectTo;
                
                if (redirectParam) {
                    redirectTo = redirectParam;
                } else if (window.location.hostname === 'simtocs.github.io') {
                    redirectTo = '/dashboard/index.html';
                } else {
                    redirectTo = 'index.html';
                }
                
                console.log('Redirect ke:', redirectTo);
                showMessage('Login berhasil! Mengalihkan...', 'success');
                
                setTimeout(function() {
                    window.location.href = redirectTo;
                }, 1500);
                
            } else {
                setLoading(false);
                showMessage('Username atau password salah!', 'error');
                document.getElementById('password').value = '';
                document.getElementById('password').focus();
            }
        })
        .catch(function(error) {
            console.error('Error:', error);
            setLoading(false);
            showMessage(error.message, 'error');
        });
}

// INITIALIZATION
window.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded');
    
    var authCookie = getCookie('userAuth');
    if (authCookie) {
        try {
            var authData = JSON.parse(atob(authCookie));
            if (new Date(authData.expiresAt) > new Date()) {
                var urlParams = new URLSearchParams(window.location.search);
                var redirectParam = urlParams.get('redirect');
                var redirectTo;
                
                if (redirectParam) {
                    redirectTo = redirectParam;
                } else if (window.location.hostname === 'simtocs.github.io') {
                    redirectTo = '/dashboard/index.html';
                } else {
                    redirectTo = 'index.html';
                }
                
                window.location.href = redirectTo;
                return;
            }
        } catch (e) {
            console.error('Cookie error:', e);
        }
    }

    var urlParams = new URLSearchParams(window.location.search);
    var message = urlParams.get('message');
    
    if (message) {
        showMessage(decodeURIComponent(message), 'error');
    }

    document.getElementById('username').focus();

    var loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    var toggleBtn = document.getElementById('togglePasswordBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', togglePassword);
    }

    var passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleLogin(e);
            }
        });
    }
});

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('username').focus();
    }
});

