document.addEventListener('DOMContentLoaded', () => {
    const SESSION_KEY = 'vx_session';

    const loginScreen = document.getElementById('login-screen');
    const mainPanel = document.getElementById('main-panel');
    const loginUsernameEl = document.getElementById('login-username');
    const loginPasswordEl = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const vidIdInput = document.getElementById('vidIdInput');
    const nameInput = document.getElementById('nameInput');
    const executeBtn = document.getElementById('executeBtn');
    const loadListBtn = document.getElementById('loadListBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const bulkAddBtn = document.getElementById('bulkAddBtn');
    const tableBody = document.querySelector('#dataTable tbody');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIconLight = document.getElementById('theme-icon-light');
    const themeIconDark = document.getElementById('theme-icon-dark');
    const confirmOverlay = document.getElementById('confirm-overlay');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');
    const bulkAddOverlay = document.getElementById('bulk-add-overlay');
    const bulkAddRowBtn = document.getElementById('bulk-add-row-btn');
    const bulkCancelBtn = document.getElementById('bulk-cancel-btn');
    const bulkSubmitBtn = document.getElementById('bulk-submit-btn');
    const bulkTbody = document.getElementById('bulk-tbody');

    let selectedIds = new Set();
    let currentTheme = 'auto';
    let confirmResolve = null;
    let sessionToken = null;

    function getStoredToken() {
        try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
    }

    function storeToken(tk) {
        try { localStorage.setItem(SESSION_KEY, tk); } catch {}
    }

    function clearToken() {
        try { localStorage.removeItem(SESSION_KEY); } catch {}
    }

    function apiFetch(path, options = {}) {
        if (!sessionToken) { showLogin(); return Promise.reject(new Error('no session')); }
        return fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken,
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers,
            },
        });
    }

    function showLogin() {
        mainPanel.classList.add('hidden');
        loginScreen.classList.remove('hidden');
        loginUsernameEl.value = '';
        loginPasswordEl.value = '';
        loginUsernameEl.focus();
    }

    function showPanel() {
        loginScreen.classList.add('hidden');
        mainPanel.classList.remove('hidden');
        initTheme();
        loadList();
    }

    async function attemptLogin() {
        const username = loginUsernameEl.value.trim();
        const password = loginPasswordEl.value;
        if (!username || !password) { showNotification('Enter username and password', true); return; }
        loginBtn.disabled = true;
        loginBtn.textContent = 'VERIFYING...';
        try {
            const res = await fetch('/matrixhasyou/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (data.token) {
                sessionToken = data.token;
                storeToken(sessionToken);
                showPanel();
            } else {
                showNotification('Invalid credentials', true);
            }
        } catch {
            showNotification('Network failure', true);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'ENTER';
        }
    }

    async function verifyStoredToken(tk) {
        try {
            const res = await fetch('/matrixhasyou/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Session-Token': tk,
                },
            });
            return res.ok;
        } catch { return false; }
    }

    async function init() {
        const stored = getStoredToken();
        if (stored) {
            const valid = await verifyStoredToken(stored);
            if (valid) { sessionToken = stored; showPanel(); return; }
            clearToken();
        }
        showLogin();
    }

    loginBtn.addEventListener('click', attemptLogin);
    loginPasswordEl.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
    loginUsernameEl.addEventListener('keydown', e => { if (e.key === 'Enter') loginPasswordEl.focus(); });

    function initTheme() {
        const saved = localStorage.getItem('vidapi-theme') || 'auto';
        currentTheme = saved;
        applyTheme(saved);
    }

    function applyTheme(theme) {
        const html = document.documentElement;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const dark = theme === 'dark' || (theme === 'auto' && prefersDark);
        html.setAttribute('data-theme', dark ? 'dark' : 'light');
        themeIconLight.classList.toggle('hidden', dark);
        themeIconDark.classList.toggle('hidden', !dark);
    }

    themeToggle.addEventListener('click', () => {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (currentTheme === 'auto') currentTheme = prefersDark ? 'light' : 'dark';
        else currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('vidapi-theme', currentTheme);
        applyTheme(currentTheme);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentTheme === 'auto') applyTheme('auto');
    });

    function showConfirm(message) {
        return new Promise(resolve => {
            confirmMessage.textContent = message;
            confirmOverlay.classList.remove('hidden');
            confirmResolve = resolve;
        });
    }

    function resolveConfirm(val) {
        confirmOverlay.classList.add('hidden');
        if (confirmResolve) { confirmResolve(val); confirmResolve = null; }
    }

    confirmOk.addEventListener('click', () => resolveConfirm(true));
    confirmCancel.addEventListener('click', () => resolveConfirm(false));
    confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) resolveConfirm(false); });

    executeBtn.addEventListener('click', handleExecute);
    loadListBtn.addEventListener('click', loadList);
    bulkDeleteBtn.addEventListener('click', handleBulkDelete);
    bulkAddBtn.addEventListener('click', openBulkAdd);
    bulkCancelBtn.addEventListener('click', closeBulkAdd);
    bulkSubmitBtn.addEventListener('click', handleBulkSubmit);
    bulkAddRowBtn.addEventListener('click', addBulkRow);
    bulkAddOverlay.addEventListener('click', e => { if (e.target === bulkAddOverlay) closeBulkAdd(); });
    selectAllCheckbox.addEventListener('click', toggleSelectAll);

    function sanitizeInput(val) {
        return /^[a-zA-Z0-9_ ]+$/.test(val);
    }

    function processValue(val) {
        return val.trim().replace(/ /g, '_');
    }

    async function handleExecute() {
        const vidId = vidIdInput.value.trim();
        const name = nameInput.value.trim();

        if (!vidId) { showNotification('VID ID is required', true); return; }
        if (!sanitizeInput(vidId)) { showNotification('VID ID: only letters, numbers and underscores allowed', true); return; }
        if (name && !sanitizeInput(name)) { showNotification('Name: only letters, numbers and underscores allowed', true); return; }

        executeBtn.disabled = true;
        executeBtn.textContent = 'ADDING...';

        const cleanVidId = processValue(vidId);
        const cleanName = name ? processValue(name) : '';
        const url = `/api/?create&VIDID=${encodeURIComponent(cleanVidId)}${cleanName ? `&NAME=${encodeURIComponent(cleanName)}` : ''}`;

        try {
            const res = await apiFetch(url);
            if (res.status === 401) { clearToken(); showLogin(); return; }
            const result = await res.json();
            if (result.status === 'success') {
                showNotification(`Added: ${result.data.name}`);
                vidIdInput.value = '';
                nameInput.value = '';
                loadList();
            } else {
                showNotification(`Error: ${result.error}`, true);
            }
        } catch {
            showNotification('Network failure', true);
        } finally {
            executeBtn.disabled = false;
            executeBtn.textContent = 'ADD';
        }
    }

    async function loadList() {
        loadListBtn.disabled = true;
        try {
            const res = await apiFetch('/list-data');
            if (!res) return;
            if (res.status === 401) { clearToken(); showLogin(); return; }
            const data = await res.json();
            selectedIds.clear();
            renderTable(data);
            updateBulkDeleteVisibility();
            showNotification('List refreshed');
        } catch {
            showNotification('Error loading list', true);
        } finally {
            loadListBtn.disabled = false;
        }
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        const countEl = document.getElementById('data-count');
        if (!data || data.length === 0) {
            if (countEl) countEl.textContent = '';
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);font-family:var(--font-mono);font-size:0.82rem;">No entries found</td>';
            tableBody.appendChild(row);
            updateSelectAllState();
            return;
        }
        if (countEl) countEl.textContent = `(${data.length})`;
        data.forEach(item => tableBody.appendChild(createRow(item)));
        updateSelectAllState();
    }

    function createRow(item) {
        const row = document.createElement('tr');

        const checkCell = document.createElement('td');
        checkCell.className = 'check-col-cell';
        const checkbox = document.createElement('div');
        checkbox.className = 'custom-checkbox';
        checkbox.dataset.checked = selectedIds.has(item.vidId) ? 'true' : 'false';
        checkbox.innerHTML = '<div class="checkbox-inner"></div>';
        checkbox.addEventListener('click', () => toggleRowSelect(item.vidId, checkbox, row));
        checkCell.appendChild(checkbox);

        const vidCell = document.createElement('td');
        vidCell.className = 'col-vid';
        const vidSpan = document.createElement('span');
        vidSpan.className = 'cell-ellipsis';
        vidSpan.textContent = item.vidId;
        vidSpan.title = item.vidId;
        vidCell.appendChild(vidSpan);

        const nameCell = document.createElement('td');
        nameCell.className = 'col-name';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'cell-ellipsis';
        nameSpan.textContent = item.name;
        nameSpan.title = item.name;
        nameCell.appendChild(nameSpan);

        const actionCell = document.createElement('td');
        actionCell.className = 'col-action';
        const delBtn = document.createElement('button');
        delBtn.textContent = 'DELETE';
        delBtn.addEventListener('click', () => deleteSingle(item.vidId));
        actionCell.appendChild(delBtn);

        row.append(checkCell, vidCell, nameCell, actionCell);
        return row;
    }

    function toggleRowSelect(vidId, checkbox, row) {
        if (selectedIds.has(vidId)) {
            selectedIds.delete(vidId);
            checkbox.dataset.checked = 'false';
            row.classList.remove('selected-row');
        } else {
            selectedIds.add(vidId);
            checkbox.dataset.checked = 'true';
            row.classList.add('selected-row');
        }
        updateSelectAllState();
        updateBulkDeleteVisibility();
    }

    function getTableIds() {
        const ids = [];
        tableBody.querySelectorAll('tr').forEach(row => {
            const sp = row.cells[1]?.querySelector('.cell-ellipsis');
            if (sp?.textContent.trim()) ids.push(sp.textContent.trim());
        });
        return ids;
    }

    function toggleSelectAll() {
        const allIds = getTableIds();
        const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
        const checkboxes = tableBody.querySelectorAll('.custom-checkbox');
        if (allSelected) {
            allIds.forEach(id => selectedIds.delete(id));
            checkboxes.forEach(cb => { cb.dataset.checked = 'false'; });
        } else {
            allIds.forEach(id => selectedIds.add(id));
            checkboxes.forEach(cb => { cb.dataset.checked = 'true'; });
        }
        updateSelectAllState();
        updateBulkDeleteVisibility();
    }

    function updateSelectAllState() {
        const allIds = getTableIds();
        const selected = allIds.filter(id => selectedIds.has(id)).length;
        if (allIds.length === 0 || selected === 0) {
            selectAllCheckbox.dataset.checked = 'false';
            selectAllCheckbox.dataset.indeterminate = 'false';
        } else if (selected === allIds.length) {
            selectAllCheckbox.dataset.checked = 'true';
            selectAllCheckbox.dataset.indeterminate = 'false';
        } else {
            selectAllCheckbox.dataset.checked = 'false';
            selectAllCheckbox.dataset.indeterminate = 'true';
        }
        selectAllCheckbox.innerHTML = '<div class="checkbox-inner"></div>';
    }

    function updateBulkDeleteVisibility() {
        bulkDeleteBtn.classList.toggle('hidden', selectedIds.size === 0);
    }

    async function deleteSingle(vidId) {
        const ok = await showConfirm(`Delete entry: ${vidId}?`);
        if (!ok) return;
        try {
            const res = await apiFetch(`/api/?del&VIDID=${encodeURIComponent(vidId)}`);
            if (!res) return;
            if (res.status === 401) { clearToken(); showLogin(); return; }
            const result = await res.json();
            if (result.status === 'success') {
                showNotification('Deleted successfully');
                selectedIds.delete(vidId);
                loadList();
            } else {
                showNotification(`Delete failed: ${result.error}`, true);
            }
        } catch {
            showNotification('Error deleting entry', true);
        }
    }

    async function handleBulkDelete() {
        if (selectedIds.size === 0) return;
        const count = selectedIds.size;
        const ok = await showConfirm(`Delete ${count} selected ${count === 1 ? 'entry' : 'entries'}?`);
        if (!ok) return;
        bulkDeleteBtn.disabled = true;
        try {
            const res = await apiFetch('/api/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ vidIds: Array.from(selectedIds) }),
            });
            if (!res) return;
            if (res.status === 401) { clearToken(); showLogin(); return; }
            const result = await res.json();
            if (result.status === 'success') {
                showNotification(`Deleted ${result.removedCount} ${result.removedCount === 1 ? 'entry' : 'entries'}`);
                selectedIds.clear();
                loadList();
            } else {
                showNotification(`Bulk delete failed: ${result.error}`, true);
            }
        } catch {
            showNotification('Network failure', true);
        } finally {
            bulkDeleteBtn.disabled = false;
        }
    }

    function openBulkAdd() {
        bulkTbody.innerHTML = '';
        addBulkRow();
        bulkAddOverlay.classList.remove('hidden');
    }

    function closeBulkAdd() {
        bulkAddOverlay.classList.add('hidden');
    }

    function addBulkRow() {
        const row = document.createElement('tr');

        const vidCell = document.createElement('td');
        const vi = document.createElement('input');
        vi.type = 'text';
        vi.placeholder = 'VID ID';
        vidCell.appendChild(vi);

        const nameCell = document.createElement('td');
        const ni = document.createElement('input');
        ni.type = 'text';
        ni.placeholder = 'Name (optional)';
        nameCell.appendChild(ni);

        const removeCell = document.createElement('td');
        const removeBtn = document.createElement('button');
        removeBtn.className = 'row-remove-btn';
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        removeBtn.addEventListener('click', () => { if (bulkTbody.rows.length > 1) row.remove(); });
        removeCell.appendChild(removeBtn);

        row.append(vidCell, nameCell, removeCell);
        bulkTbody.appendChild(row);
        vi.focus();
    }

    async function handleBulkSubmit() {
        const rows = Array.from(bulkTbody.rows);
        const entries = [];
        for (const row of rows) {
            const vidId = row.cells[0].querySelector('input').value.trim();
            const name = row.cells[1].querySelector('input').value.trim();
            if (!vidId) continue;
            if (!sanitizeInput(vidId)) { showNotification('VID ID: only letters, numbers and underscores allowed', true); return; }
            if (name && !sanitizeInput(name)) { showNotification('Name: only letters, numbers and underscores allowed', true); return; }
            entries.push({ vidId: processValue(vidId), name: name ? processValue(name) : undefined });
        }
        if (entries.length === 0) { showNotification('No valid VID IDs entered', true); return; }

        bulkSubmitBtn.disabled = true;
        bulkSubmitBtn.textContent = 'ADDING...';
        try {
            const res = await apiFetch('/api/bulk-create', {
                method: 'POST',
                body: JSON.stringify({ entries }),
            });
            if (!res) return;
            if (res.status === 401) { clearToken(); showLogin(); return; }
            const result = await res.json();
            if (result.status === 'success') {
                const skipped = result.errors?.length || 0;
                const msg = skipped > 0
                    ? `Added ${result.addedCount}, ${skipped} skipped`
                    : `Added ${result.addedCount} ${result.addedCount === 1 ? 'entry' : 'entries'}`;
                showNotification(msg);
                closeBulkAdd();
                loadList();
            } else {
                showNotification(`Bulk add failed: ${result.error}`, true);
            }
        } catch {
            showNotification('Network failure', true);
        } finally {
            bulkSubmitBtn.disabled = false;
            bulkSubmitBtn.textContent = 'Add';
        }
    }

    function showNotification(message, isError = false) {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = 'notification' + (isError ? ' error' : '');

        const msgSpan = document.createElement('span');
        msgSpan.className = 'notification-text';
        msgSpan.textContent = message;
        msgSpan.title = message;

        const closeSpan = document.createElement('span');
        closeSpan.className = 'notification-close';
        closeSpan.textContent = '[x]';

        notif.append(msgSpan, closeSpan);

        const remove = () => {
            notif.style.animation = 'fadeOut 0.25s ease-out forwards';
            setTimeout(() => notif.remove(), 260);
        };
        notif.addEventListener('click', remove);
        container.appendChild(notif);
        setTimeout(remove, 5000);
    }

    init();
});