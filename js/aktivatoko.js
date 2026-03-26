// aktivatoko.js - SIMTOCS Asset Data Logic
const AKTIVA_CONFIG = {
    // Reuses IDs from your existing CONFIG
    SPREADSHEET_ID: '1rRwjnxKKsKXn4gYGhld8HqcYH3ycU7wz1b3sk_UFMko', 
    RANGES: 'A1:E200' // Range covering the CSV structure you uploaded
};

async function loadAktivaData() {
    const store = document.getElementById('storeSelect').value;
    if (!store) return;

    const contentArea = document.getElementById('aktivaContent');
    contentArea.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Memuat data aktiva...</p></div>';

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: AKTIVA_CONFIG.SPREADSHEET_ID,
            range: `${store}!${AKTIVA_CONFIG.RANGES}`,
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            contentArea.innerHTML = '<p class="error">Data aktiva tidak ditemukan untuk toko ini.</p>';
            return;
        }

        renderAktivaTable(rows);
    } catch (err) {
        console.error('Sheet Error:', err);
        contentArea.innerHTML = `<p class="error">Gagal memuat data: ${err.result?.error?.message || err.message}</p>`;
    }
}

function renderAktivaTable(data) {
    let html = `
        <div class="aktiva-card">
            <div class="aktiva-table-wrapper">
                <table class="aktiva-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Nama Item</th>
                            <th>Tanggal Beli</th>
                            <th>Jumlah</th>
                            <th>Biaya Perolehan</th>
                        </tr>
                    </thead>
                    <tbody>`;

    // Skip the CSV header row
    data.slice(1).forEach(row => {
        // Check if row is a category (has content only in the first or second column)
        if (row.length <= 2 && row[0] !== "") {
            html += `<tr class="category-header"><td colspan="5">${row[0] || row[1]}</td></tr>`;
        } else if (row.length >= 4) {
            html += `
                <tr>
                    <td>${row[0] || '-'}</td>
                    <td>${row[1] || '-'}</td>
                    <td>${row[2] || '-'}</td>
                    <td>${row[3] || '0'}</td>
                    <td>${formatRupiah(row[4])}</td>
                </tr>`;
        }
    });

    html += `</tbody></table></div></div>`;
    document.getElementById('aktivaContent').innerHTML = html;
}
