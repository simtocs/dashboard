'use strict';

/* ===== CONFIG ===== */
const CONFIG = {
    CLIENT_ID: '874016971039-g91m2mt64mid7sh9vkk14vpjmpbc095o.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCMpk-2HdASd6oX-MBRqehgXX-kTfzpFw0',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    REPAIR_SPREADSHEET_ID: '',   // paste the ID of a NEW spreadsheet here. Empty = local-only mode
    REPAIR_TAB: 'Perbaikan'      // tab name. Row 1 = headers, data from row 2, columns A:G
};
const STORAGE_KEY = 'simtocs_perbaikan_v1';   // only used in local-only mode
const INACTIVITY_LIMIT = 5 * 60 * 1000;
const WARNING_TIME = 60 * 1000;

const STORES = [
    ['F4SD', 'Carang Sari 1', 'Gatsu Timur, Denpasar'],
    ['FKOM', 'Carang Sari 2', 'Wanagiri, Buleleng'],
    ['FHEN', 'Carang Sari 3', 'Cempaga, Bangli'],
    ['FEHU', 'Carang Sari 4', 'Mambal, Badung'],
    ['FIVI', 'Carang Sari 5', 'Ketapang, Banyuwangi'],
    ['FZ7Y', 'Carang Sari 6', 'Pemuda, Mataram'],
    ['1SFY', 'Carang Sari 7', 'Mantang, Batukliang'],
    ['Q789', 'Carang Sari 8', 'Rendang, Karangasem']
];

// [kode, deskripsi, urgensi, status, progres] - seed data from the 26 Sept 2026 report
const SEED = [
    ['FKOM', 'Lampu chiller mati 3 pcs', 'Medium', 'Attended', 'Order lampu ke Team Admin'],
    ['FKOM', 'Lampu toko mati 2 pcs + gudang 1 pcs', 'Medium', 'Attended', 'Order lampu ke Team Admin'],
    ['FKOM', 'Paving parkir oblak 3m² (~75 pcs)', 'Medium', 'Attended', 'Penyusunan owner estimate untuk benchmarking harga vendor'],
    ['FKOM', 'Garis parkir pudar ~46 meter', 'Medium', 'Attended', 'Penyusunan owner estimate untuk benchmarking harga vendor'],
    ['FKOM', 'CCTV Ezviz mati', 'High', 'Attended', 'Unit CCTV dan MCB terpantau aman, pengecekan kelistrikan oleh Pak Widodo'],
    ['FKOM', 'Bagian bodi luar chiller kotor', 'Low', 'Attended', 'Perlu dilakukan pembersihan agar toko tetap higienis'],
    ['FKOM', 'Pemotongan partisi dinding toko (7,6m x 10cm)', 'Medium', 'Attended', 'Mempermudah menggeser chiller - Penyusunan owner estimate untuk benchmarking vendor'],
    ['FKOM', 'TV layar mati', 'Low', 'Unattended', 'Belum ada tindakan lanjut'],
    ['FKOM', 'Lampu rak display rokok tidak ada', 'Low', 'Unattended', 'Belum ada tindakan lanjut'],
    ['FKOM', 'Pest control (Perangkap tikus & anti semut)', 'High', 'Attended', 'Sudah dipasangi perangkap tikus dan anti semut dengan kapur ajaib'],
    ['FKOM', 'Water pump danau buyan', 'Medium', 'Attended', 'Anggota tim dispatch sudah dibentuk - Koordinasi penentuan jadwal keberangkatan'],
    ['FHEN', 'AC FHEN 01 sejajar kasir tidak bisa dinyalakan', 'High', 'Attended', 'Pemeriksaan: PCB unit tidak berfungsi. Kelistrikan aman - Penyusunan owner estimate benchmarking vendor'],
    ['FHEN', 'Lis plafon barat & selatan patah (11m / 2 lis gipsum)', 'Medium', 'Attended', 'Penyusunan owner estimate untuk benchmarking harga vendor'],
    ['FHEN', 'Pemotongan partisi dinding toko (7,2m x 10cm)', 'Medium', 'Attended', 'Mempermudah menggeser chiller - Penyusunan owner estimate untuk benchmarking vendor'],
    ['FHEN', 'Pengecatan rak galon', 'Low', 'Attended', 'Akan dilakukan pengerokan dan pengecatan pada kunjungan berikutnya'],
    ['FEHU', 'Perbaikan neonbox lisplang dan tiang', 'Medium', 'Hold', 'Vendor stiker ketemu (Bp. Roy Aryadi). Vendor neonbox ON HOLD terkait penawaran harga'],
    ['FIVI', 'Pembuatan man hole di area sales', 'Medium', 'Attended', 'Mempermudah akses maintenance diatas plafon - Penyusunan owner estimate benchmarking vendor'],
    ['FZ7Y', 'Pembersihan & pengecatan dinding teras timur berlumut + atap kanopi berlubang', 'Medium', 'Attended', 'Sebab lembab diatasi - Perbaikan dinding & plafon kanopi sedang penyusunan owner estimate benchmarking vendor'],
    ['Q789', 'Pengecatan dinding fasad toko kotor (~23 m²)', 'Low', 'Attended', 'Penyusunan owner estimate untuk benchmarking harga vendor'],
    ['Q789', 'Pemasangan wall ads dalam area sales (2 unit)', 'Low', 'Attended', 'Sudah dikoordinasikan dengan Maintenance Alfamart untuk konten wall ads'],
    ['Q789', 'Keramik gores/kusam (~20 pc)', 'Low', 'Attended', 'Penggantian / stiker vinyl lantai - Penyusunan owner estimate benchmarking vendor'],
    ['Q789', 'Penggantian engsel pintu gudang macet', 'High', 'Attended', 'Penyusunan owner estimate untuk benchmarking harga vendor'],
    ['Q789', 'Pivot atas pintu masuk barat drop', 'High', 'Attended', 'Akan benturan dengan pintu sebelah timur - Penyusunan owner estimate benchmarking vendor']
];

/* ===== STATE ===== */
let items = [];
let accessToken = null, tokenClient = null, gapiInited = false;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const storeIdx = k => STORES.findIndex(s => s[0] === k);

const SHEET_ON = () => !!CONFIG.REPAIR_SPREADSHEET_ID;
const canEdit = () => !SHEET_ON() || !!accessToken;
const rowToItem = r => ({ id: r[0] || '', kode: r[1] || '', deskripsi: r[2] || '', urgensi: r[3] || 'Medium', status: r[4] || 'Attended', progres: r[5] || '' });
const itemToRow = i => [i.id, i.kode, i.deskripsi, i.urgensi, i.status, i.progres, new Date().toISOString()];

function localLoad() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(raw)) return raw;
    } catch (e) { /* fall through to seed */ }
    return SEED.map((s, i) => ({ id: 's' + i, kode: s[0], deskripsi: s[1], urgensi: s[2], status: s[3], progres: s[4] }));
}
function localSave() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { alert('Data tidak dapat disimpan di browser ini.'); }
}

async function loadItems() {
    if (!SHEET_ON()) return localLoad();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.REPAIR_SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.REPAIR_TAB)}!A2:G?key=${CONFIG.API_KEY}`;
    const d = await (await fetch(url)).json();
    if (d.error) throw new Error(d.error.message);
    return (d.values || []).filter(r => r[0]).map(rowToItem);
}

async function refresh() {
    try { items = await loadItems(); render(); }
    catch (e) { $('content').innerHTML = '<div class="error"><strong>❌ Gagal Memuat Data</strong>' + esc(e.message) + '<br><br>Pastikan spreadsheet dapat dibaca publik dan nama tab sesuai (' + esc(CONFIG.REPAIR_TAB) + ').</div>'; }
}

// Writes to Google Sheets (admin + OAuth only). action: add | update | delete
async function persist(action, item) {
    if (!accessToken || !gapiInited) throw new Error('Harap otentikasi terlebih dahulu (tombol Otentikasi di kanan atas).');
    const sp = CONFIG.REPAIR_SPREADSHEET_ID, tab = CONFIG.REPAIR_TAB, sh = gapi.client.sheets.spreadsheets;
    if (action === 'add') {
        return sh.values.append({ spreadsheetId: sp, range: `${tab}!A:G`, valueInputOption: 'USER_ENTERED', resource: { values: [itemToRow(item)] } });
    }
    const col = await sh.values.get({ spreadsheetId: sp, range: `${tab}!A:A` });
    const idx = (col.result.values || []).findIndex(v => v[0] === item.id);
    if (idx < 0) throw new Error('Data tidak ditemukan di sheet. Coba refresh halaman.');
    const row = idx + 1;
    if (action === 'update') {
        return sh.values.update({ spreadsheetId: sp, range: `${tab}!A${row}:G${row}`, valueInputOption: 'USER_ENTERED', resource: { values: [itemToRow(item)] } });
    }
    const meta = await sh.get({ spreadsheetId: sp });
    const sheet = meta.result.sheets.find(s => s.properties.title === tab);
    if (!sheet) throw new Error('Tab "' + tab + '" tidak ditemukan.');
    return sh.batchUpdate({ spreadsheetId: sp, resource: { requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } }] } });
}

async function seedSheet() {
    if (!confirm('Isi sheet dengan ' + SEED.length + ' data awal dari laporan 26 Sept 2026?')) return;
    try {
        const stamp = Date.now();
        const rows = SEED.map((s, i) => itemToRow({ id: 's' + stamp + i, kode: s[0], deskripsi: s[1], urgensi: s[2], status: s[3], progres: s[4] }));
        await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: CONFIG.REPAIR_SPREADSHEET_ID, range: `${CONFIG.REPAIR_TAB}!A:G`, valueInputOption: 'USER_ENTERED', resource: { values: rows } });
        await refresh();
    } catch (err) { alert('Gagal mengisi data awal: ' + (err.result?.error?.message || err.message)); }
}

/* ===== DATA VIEW (every number is computed from rows) ===== */
function getView() {
    const f = { store: $('fStore').value, urg: $('fUrg').value, stat: $('fStat').value };
    const count = {};
    const numbered = items.map(i => ({ ...i, no: (count[i.kode] = (count[i.kode] || 0) + 1) }));
    const stores = STORES.filter(s => !f.store || s[0] === f.store);
    const rows = numbered
        .filter(i => (!f.store || i.kode === f.store) && (!f.urg || i.urgensi === f.urg) && (!f.stat || i.status === f.stat))
        .sort((a, b) => storeIdx(a.kode) - storeIdx(b.kode));
    const showNormal = !f.urg && !f.stat;
    const normal = showNormal ? stores.filter(s => !items.some(i => i.kode === s[0])) : [];
    const n = (k, v) => rows.filter(r => r[k] === v).length;
    const sum = {
        toko: stores.length, total: rows.length,
        high: n('urgensi', 'High'), medium: n('urgensi', 'Medium'), low: n('urgensi', 'Low'),
        attended: n('status', 'Attended'), unattended: rows.length - n('status', 'Attended')
    };
    const perStore = stores.map(s => {
        const r = rows.filter(x => x.kode === s[0]);
        return { s, total: r.length, high: r.filter(x => x.urgensi === 'High').length, medium: r.filter(x => x.urgensi === 'Medium').length, low: r.filter(x => x.urgensi === 'Low').length };
    });
    return { rows, normal, sum, perStore };
}

/* ===== RENDER ===== */
function render() {
    $('addBtn').style.display = canEdit() ? '' : 'none';
    document.body.classList.toggle('no-edit', !canEdit());
    const { rows, normal, sum, perStore } = getView();
    const card = (v, l, c) => `<div class="stat-card ${c || ''}"><h3>${v}</h3><p>${l}</p></div>`;
    let html = (SHEET_ON() && accessToken && !items.length ? '<div style="margin-bottom:20px"><button class="add-btn" onclick="seedSheet()">📥 Isi Data Awal (' + SEED.length + ' temuan)</button></div>' : '') + '<div class="stats">' +
        card(sum.toko, 'Total Toko') + card(sum.total, 'Total Temuan') +
        card(sum.high, 'Urgensi High', 'high') + card(sum.medium, 'Urgensi Medium', 'medium') + card(sum.low, 'Urgensi Low', 'low') +
        `<div class="stat-card-finale"><h3>${sum.attended}</h3><p>Attended</p></div>` +
        card(sum.unattended, 'Unattended / Hold', 'high') + '</div>';

    html += '<h2 class="section-title">Ringkasan Status per Toko</h2><div class="table-container"><table><thead><tr>' +
        '<th>Kode</th><th>Nama Toko</th><th>Lokasi</th><th>Total Item</th><th>High</th><th>Medium</th><th>Low</th></tr></thead><tbody>' +
        perStore.map(p => `<tr><td class="num">${esc(p.s[0])}</td><td class="left">${esc(p.s[1])}</td><td class="left">${esc(p.s[2])}</td>` +
            `<td class="num">${p.total}</td><td class="num">${p.high}</td><td class="num">${p.medium}</td><td class="num">${p.low}</td></tr>`).join('') +
        '</tbody></table></div>';

    html += '<h2 class="section-title">Laporan Detail Perbaikan</h2>';
    if (!rows.length && !normal.length) {
        html += '<div class="empty-state"><div class="empty-state-icon">🔍</div><h2>Tidak ada temuan</h2><p>Ubah filter atau tambah temuan baru.</p></div>';
    } else {
        html += '<div class="table-container"><table><thead><tr><th>Kode</th><th>Nama Toko</th><th>Lokasi</th><th>No.</th>' +
            '<th>Deskripsi Masalah / Pekerjaan</th><th>Urgensi</th><th>Status</th><th>Progres &amp; Tindak Lanjut</th><th class="act">Aksi</th></tr></thead><tbody>';
        const storeCells = k => { const s = STORES[storeIdx(k)]; return `<td class="num">${esc(s[0])}</td><td class="left">${esc(s[1])}</td><td class="left">${esc(s[2])}</td>`; };
        const all = [...rows.map(r => ({ r })), ...normal.map(s => ({ n: s }))]
            .sort((a, b) => storeIdx((a.r || {}).kode || (a.n || [])[0]) - storeIdx((b.r || {}).kode || (b.n || [])[0]));
        html += all.map(x => x.r
            ? `<tr>${storeCells(x.r.kode)}<td class="num">${x.r.no}</td><td class="left desc">${esc(x.r.deskripsi)}</td>` +
              `<td class="num"><span class="badge b-${x.r.urgensi}">${x.r.urgensi}</span></td><td class="num"><span class="badge b-${x.r.status}">${x.r.status}</span></td>` +
              `<td class="left">${esc(x.r.progres)}</td><td class="actions"><button class="btn-edit" onclick="openModal('${x.r.id}')">✏️</button>` +
              `<button class="btn-delete" onclick="deleteItem('${x.r.id}')">🗑️</button></td></tr>`
            : `<tr>${storeCells(x.n[0])}<td class="num">-</td><td class="left muted">Belum ada catatan perbaikan (Operasional Normal)</td>` +
              `<td class="num">-</td><td class="num"><span class="badge b-Normal">Normal</span></td><td class="left muted">Seluruh fasilitas toko terpantau operasional dengan baik</td><td class="actions"></td></tr>`
        ).join('');
        html += '</tbody></table></div>';
    }
    $('content').innerHTML = html;
}

function applyFilter() { render(); }

/* ===== CRUD ===== */
function fillStoreSelects() {
    $('fStore').innerHTML = '<option value="">Semua Toko</option>' + STORES.map(s => `<option value="${s[0]}">${s[0]} - ${s[1]} (${s[2]})</option>`).join('');
    $('mStore').innerHTML = STORES.map(s => `<option value="${s[0]}">${s[0]} - ${s[1]}</option>`).join('');
}

function openModal(id) {
    const it = id ? items.find(i => i.id === id) : null;
    $('modalTitle').textContent = it ? 'Edit Temuan' : 'Tambah Temuan';
    $('editId').value = it ? it.id : '';
    $('mStore').value = it ? it.kode : ($('fStore').value || STORES[0][0]);
    $('mDesc').value = it ? it.deskripsi : '';
    $('mUrg').value = it ? it.urgensi : 'Medium';
    $('mStat').value = it ? it.status : 'Attended';
    $('mProg').value = it ? it.progres : '';
    $('dataModal').classList.add('active');
}
function closeModal() { $('dataModal').classList.remove('active'); }

async function handleSubmit(e) {
    e.preventDefault();
    const rec = { kode: $('mStore').value, deskripsi: $('mDesc').value.trim(), urgensi: $('mUrg').value, status: $('mStat').value, progres: $('mProg').value.trim() };
    const id = $('editId').value;
    try {
        if (SHEET_ON()) {
            await persist(id ? 'update' : 'add', { id: id || 'n' + Date.now(), ...rec });
        } else {
            if (id) Object.assign(items.find(i => i.id === id), rec); else items.push({ id: 'n' + Date.now(), ...rec });
            localSave();
        }
        closeModal();
        await refresh();
    } catch (err) { alert('Gagal menyimpan: ' + (err.result?.error?.message || err.message)); }
}

async function deleteItem(id) {
    if (!confirm('Hapus temuan ini?')) return;
    try {
        if (SHEET_ON()) await persist('delete', { id });
        else { items = items.filter(i => i.id !== id); localSave(); }
        await refresh();
    } catch (err) { alert('Gagal menghapus: ' + (err.result?.error?.message || err.message)); }
}

/* ===== PDF EXPORT ===== */
function exportPDF() {
    if (!window.jspdf) { alert('Library PDF belum termuat. Periksa koneksi internet lalu coba lagi.'); return; }
    const { rows, normal, sum, perStore } = getView();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date();
    const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sept', 'Okt', 'Nov', 'Des'];
    const tgl = `${now.getDate()} ${bln[now.getMonth()]} ${now.getFullYear()}`;
    const PINK = [255, 105, 180], BLUE = [74, 144, 226];

    // Page 1: executive summary
    doc.setFillColor(...PINK); doc.rect(0, 0, 297, 24, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('DASHBOARD REKAPITULASI MAINTENANCE CARANG SARI', 10, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Ringkasan Eksekutif Pemeliharaan Toko  |  Per ' + tgl, 10, 18);

    const kpis = [['TOTAL TOKO', sum.toko], ['TOTAL TEMUAN', sum.total], ['URGENSI HIGH', sum.high], ['URGENSI MEDIUM', sum.medium],
        ['URGENSI LOW', sum.low], ['ATTENDED', sum.attended], ['UNATTENDED / HOLD', sum.unattended]];
    kpis.forEach((k, i) => {
        const x = 10 + i * 40;
        doc.setFillColor(248, 249, 250); doc.setDrawColor(...BLUE); doc.roundedRect(x, 30, 37, 20, 2, 2, 'FD');
        doc.setTextColor(...PINK); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(String(k[1]), x + 18.5, 40, { align: 'center' });
        doc.setTextColor(73, 80, 87); doc.setFontSize(7); doc.text(k[0], x + 18.5, 46, { align: 'center' });
    });

    doc.setTextColor(40); doc.setFontSize(11); doc.text('RINGKASAN STATUS PER TOKO', 10, 58);
    doc.autoTable({
        startY: 61, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: BLUE, halign: 'center' },
        head: [['Kode', 'Nama Toko', 'Lokasi', 'Total Item', 'High', 'Medium', 'Low']],
        body: perStore.map(p => [p.s[0], p.s[1], p.s[2], p.total, p.high, p.medium, p.low]),
        columnStyles: { 0: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' } }
    });

    // Page 2+: detail
    doc.addPage();
    doc.setFillColor(...PINK); doc.rect(0, 0, 297, 20, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('LAPORAN DETAIL PERBAIKAN TOKO CARANG SARI', 10, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Update Monitoring Pemeliharaan Operasional Toko', 10, 16);

    const body = [
        ...rows.map(r => [storeIdx(r.kode) + 1, r.kode, STORES[storeIdx(r.kode)][1], STORES[storeIdx(r.kode)][2], r.no, r.deskripsi, r.urgensi, r.status, r.progres || '-']),
        ...normal.map(s => [storeIdx(s[0]) + 1, s[0], s[1], s[2], '-', '- Belum ada catatan perbaikan (Operasional Normal) -', '-', 'Normal', 'Seluruh fasilitas toko terpantau operasional dengan baik'])
    ].sort((a, b) => a[0] - b[0] || (Number(a[4]) || 0) - (Number(b[4]) || 0));

    const tone = { High: [[248, 215, 218], [114, 28, 36]], Medium: [[255, 243, 205], [133, 100, 4]], Low: [[212, 237, 218], [21, 87, 36]],
        Attended: [[212, 237, 218], [21, 87, 36]], Unattended: [[248, 215, 218], [114, 28, 36]], Hold: [[255, 243, 205], [133, 100, 4]], Normal: [[233, 236, 239], [73, 80, 87]] };
    doc.autoTable({
        startY: 25, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle' },
        headStyles: { fillColor: BLUE, halign: 'center' },
        head: [['No', 'Kode', 'Nama Toko', 'Lokasi', 'Item', 'Deskripsi Masalah / Pekerjaan', 'Urgensi', 'Status', 'Progres & Tindak Lanjut']],
        body,
        columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 26 }, 3: { cellWidth: 34 }, 4: { cellWidth: 12, halign: 'center' },
            5: { cellWidth: 70 }, 6: { cellWidth: 17, halign: 'center' }, 7: { cellWidth: 20, halign: 'center' }, 8: { cellWidth: 76 } },
        didParseCell(d) {
            if (d.section !== 'body' || (d.column.index !== 6 && d.column.index !== 7)) return;
            const t = tone[d.cell.raw]; if (!t) return;
            d.cell.styles.fillColor = t[0]; d.cell.styles.textColor = t[1]; d.cell.styles.fontStyle = 'bold';
        }
    });

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
        doc.text('SIMTOCS - Toko Carang Sari  |  Dicetak oleh ' + ($('displayUsername').textContent || 'Guest') + '  |  ' + tgl, 10, 205);
        doc.text(`Halaman ${p} dari ${pages}`, 287, 205, { align: 'right' });
    }
    doc.save(`${now.getDate()}_${bln[now.getMonth()]}_${now.getFullYear()}_Laporan_Maintenance_Toko_Carang_Sari.pdf`);
}

/* ===== AUTH (same cookie session as the other pages) ===== */
function getCookie(name) {
    const eq = name + '=';
    for (const c of document.cookie.split(';')) { const s = c.trim(); if (s.indexOf(eq) === 0) return s.substring(eq.length); }
    return null;
}
function deleteCookie(name) { document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'; }
function getAuthData() {
    try { const s = getCookie('userAuth'); return s ? JSON.parse(atob(s)) : null; } catch (e) { return null; }
}
function checkAuth() {
    const a = getAuthData();
    if (!a) { window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname); return false; }
    if (a.expiresAt && new Date() > new Date(a.expiresAt)) {
        deleteCookie('userAuth');
        window.location.href = 'login.html?message=' + encodeURIComponent('Session expired');
        return false;
    }
    $('displayUsername').textContent = a.username || 'Guest';
    $('authBtn').style.display = SHEET_ON() && (a.role || '').toLowerCase() === 'admin' ? 'flex' : 'none';
    return true;
}

function logout(message) {
    if (!message && !confirm('Yakin ingin logout?')) return;
    accessToken = null; clearStoredToken(); deleteCookie('userAuth');
    window.location.href = 'login.html' + (message ? '?message=' + encodeURIComponent(message) : '');
}

/* ===== GOOGLE OAUTH (same token storage keys as surkas page) ===== */
function storeToken(t, exp) {
    try { localStorage.setItem('oauth_token', t); localStorage.setItem('oauth_expiry', String(Date.now() + exp * 1000)); } catch (e) { /* ignore */ }
}
function clearStoredToken() {
    try { localStorage.removeItem('oauth_token'); localStorage.removeItem('oauth_expiry'); } catch (e) { /* ignore */ }
}
function restoreToken() {
    try {
        const t = localStorage.getItem('oauth_token'), e = parseInt(localStorage.getItem('oauth_expiry'), 10);
        if (t && e && Date.now() < e - 300000) { accessToken = t; gapi.client.setToken({ access_token: t }); updateAuthButton(); return true; }
        clearStoredToken();
    } catch (err) { /* ignore */ }
    return false;
}
function updateAuthButton() {
    $('authBtn').classList.toggle('authenticated', !!accessToken);
    $('authBtnText').textContent = accessToken ? '✓ Terotentikasi' : 'Otentikasi';
}
function handleAuth() {
    if (!tokenClient || !gapiInited) { alert('Google API belum siap. Tunggu sebentar lalu coba lagi.'); return; }
    if (accessToken) { alert('Sudah terotentikasi!'); return; }
    tokenClient.callback = r => {
        if (r.error) { alert('Gagal otentikasi: ' + r.error); return; }
        accessToken = r.access_token;
        storeToken(accessToken, r.expires_in || 3600);
        gapi.client.setToken({ access_token: accessToken });
        updateAuthButton(); render();
    };
    tokenClient.requestAccessToken({ prompt: gapi.client.getToken() === null ? 'consent' : '' });
}
function initGoogle() {
    if (!SHEET_ON()) return;
    if (typeof google !== 'undefined') tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CONFIG.CLIENT_ID, scope: CONFIG.SCOPES, callback: '' });
    if (typeof gapi !== 'undefined') gapi.load('client', async () => {
        try {
            await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
            gapiInited = true;
            if (restoreToken()) render();
        } catch (e) { console.error('GAPI init failed', e); }
    });
}

/* ===== AUTO-LOGOUT ===== */
let inactivityTimer, warningTimer, countdownInterval;
function resetInactivityTimer() {
    clearTimeout(inactivityTimer); clearTimeout(warningTimer); clearInterval(countdownInterval);
    $('logoutWarning').classList.remove('show');
    warningTimer = setTimeout(showLogoutWarning, INACTIVITY_LIMIT - WARNING_TIME);
    inactivityTimer = setTimeout(() => logout('Anda telah logout otomatis karena tidak ada aktivitas selama 5 menit'), INACTIVITY_LIMIT);
}
function showLogoutWarning() {
    let c = 60;
    $('warningCountdown').textContent = c;
    $('logoutWarning').classList.add('show');
    countdownInterval = setInterval(() => { $('warningCountdown').textContent = --c; if (c <= 0) clearInterval(countdownInterval); }, 1000);
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    fillStoreSelects();
    refresh();
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(ev => document.addEventListener(ev, resetInactivityTimer, true));
    resetInactivityTimer();
});
window.addEventListener('load', initGoogle);
