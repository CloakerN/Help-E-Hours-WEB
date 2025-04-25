const lix = [
    '',  
    ...'abcdefghijklmnopqrstuvwxyz',
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ...Array.from({length: 10}, (_, i) => i.toString()),
    '.', '-', '@', '!', '$', '%', '&', '#', '/', ':', '?', '_'
];

function deco(encodedStr) {
    if (encodedStr.length % 2 !== 0) {
        throw new Error('Encoded string has odd length.');
    }
    const chars = [];
    for (let i = 0; i < encodedStr.length; i += 2) {
        const index = parseInt(encodedStr.substring(i, i + 2), 10);
        if (index < 1 || index >= lix.length) throw new Error(`Invalid index "${index}" in encoded string.`);
        chars.push(lix[index]);
    }
    return chars.join('');
}

const supabaseUrl = 'https://eygsxxhjxeugfhaysfjm.supabase.co';
const supabaseKey = '05253608023303094109363547263554400935193514445803293559351116504829366263052536160356390941093626045028085113322652453519351436125209355935134858525640570533081705334854525552155150122652131620350923090313621952453559351332210255570938293616515043094110315640304356403047584030471935134857032935593910275539303925394611534050536319620722205403221559065120324022105515606064463312444555183524592615266456545303280831';
const sbasey = deco(supabaseKey).trim();
const supabase = window.supabase.createClient(supabaseUrl, sbasey);

const ADMIN_PASSWORD = '66270413545556676767';
const MASTER_PASSWORD = '65656527041368545556';
const admi = deco(ADMIN_PASSWORD).trim();
const mast = deco(MASTER_PASSWORD).trim();
const SENSITIVE_COLUMNS = /^(email|e-mail|endereco|end|tel|telefone|cel|celular|_email|_e-mail|_endereco|_end|_tel|_telefone|_cel|_celular)$/i;

let currentTable = null;
let columns = [];
let originalColumnOrder = [];
let visibleColumns = [];
let primaryKey = null;
let isPkInteger = false;
let lastPkValue = 0;
let originalPkValue = null;
let allData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 20;
let currentSort = { column: null, order: 'asc' };
let initialSort = { column: null, order: 'asc' };
let subscriptionChannel = null;
let isRealtimeConnected = false;
let secureLog = null;
let deletedRows = [];
let allowUnload = false;
let isKeyboardAction = false;
let isAdminAuthenticated = false;
let isMasterAuthenticated = false;
let messageLog = [];

const confirmDownloadModal = document.getElementById('confirmDownloadModal');
const confirmNoDownloadModal = document.getElementById('confirmNoDownloadModal');

const docsButton = document.getElementById('docsButton');

function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function logMessage(index, message) {
    const timestamp = getTimestamp();
    const logEntry = `[${timestamp}] ${index}-${message}`;
    if (!messageLog.includes(logEntry)) {
        messageLog.push(logEntry);
    }
}

function downloadMessageLog() {
    if (!messageLog.length) {
        document.getElementById('errorMessage').textContent = '19-Nenhum log de mensagens para imprimir.';
        logMessage(19, 'Nenhum log de mensagens para imprimir.');
        updateMessages();
        return;
    }
    const timestamp = getTimestamp();
    const content = `Log de Mensagens (${timestamp})\n\n${messageLog.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `txt_MGNSLog_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function updateSecureLog(record) {
    const timestamp = getTimestamp();
    if (secureLog === null) {
        secureLog = `SecureLog ${timestamp}\n`;
        document.getElementById('downloadLogButton').style.display = 'inline';
    }
    const visibleRecord = {};
    visibleColumns.forEach(col => {
        visibleRecord[col] = record[col];
    });
    secureLog += `[${timestamp}] Tabela: ${currentTable} Dados excluídos: ${JSON.stringify(visibleRecord)}\n`;
}

function downloadSecureLog() {
    if (secureLog === null) return;
    const timestamp = getTimestamp();
    const prefix = isMasterAuthenticated ? 'Master' : isAdminAuthenticated ? 'ADM' : '';
    const filename = `sql_${prefix}_SecureLog_${timestamp}.txt`;
    const blob = new Blob([secureLog], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    secureLog = null;
    deletedRows = [];
    document.getElementById('downloadLogButton').style.display = 'none';
}

function downloadTableData() {
    if (!currentTable || !filteredData.length) {
        document.getElementById('errorMessage').textContent = '19-Nenhuma tabela ou dados para imprimir.';
        logMessage(19, 'Nenhuma tabela ou dados para imprimir.');
        updateMessages();
        return;
    }
    const timestamp = getTimestamp();
    const prefix = isMasterAuthenticated ? 'Master' : isAdminAuthenticated ? 'ADM' : '';
    let columnsToPrint = visibleColumns;
    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        columnsToPrint = visibleColumns.filter(col => !SENSITIVE_COLUMNS.test(col));
    }
    let content = `Tabela: ${currentTable} (${timestamp})\n\n`;
    content += columnsToPrint.join('\t') + '\n';
    content += '-'.repeat(columnsToPrint.length * 10) + '\n';
    filteredData.forEach(row => {
        const rowData = columnsToPrint.map(col => row[col] ?? '').join('\t');
        content += rowData + '\n';
    });
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `print_${prefix}_TableLog_${currentTable}_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function undoDeleteRows() {
    clearMessages();
    if (!deletedRows.length) {
        document.getElementById('errorMessage').textContent = '20-Nenhuma linha excluída para restaurar.';
        logMessage(20, 'Nenhuma linha excluída para restaurar.');
        updateMessages();
        return;
    }
    try {
        for (const row of deletedRows) {
            const pkValue = row[primaryKey];
            const hasDuplicate = await checkForDuplicatePk(pkValue);
            if (hasDuplicate) {
                document.getElementById('errorMessage').textContent = `21-Erro: A chave primária "${pkValue}" já existe na tabela.`;
                logMessage(21, `Erro: A chave primária "${pkValue}" já existe na tabela.`);
                updateMessages();
                continue;
            }
            const { error } = await supabase.from(currentTable).insert([row]);
            if (error) throw error;
        }
        deletedRows = [];
        document.getElementById('undoDeleteButton').style.display = 'none';
        await loadTable();
        document.getElementById('successMessage').textContent = '23-Linhas restauradas com sucesso!';
        logMessage(23, 'Linhas restauradas com sucesso!');
    } catch (error) {
        document.getElementById('errorMessage').textContent = `22-Erro ao restaurar linhas: ${error.message}`;
        logMessage(22, `Erro ao restaurar linhas: ${error.message}`);
    }
    updateMessages();
}

function updateMessages() {
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const loadingMessage = document.getElementById('loadingMessage');
    const adminMessage = document.getElementById('adminMessage');
    const displayPrompt = document.getElementById('display_prompt');

    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        adminMessage.textContent = '4-Algumas funcionalidades e colunas estão desabilitadas. Insira a senha ADM ou Master.';
        logMessage(4, 'Algumas funcionalidades e colunas estão desabilitadas. Insira a senha ADM ou Master.');
    } else {
        adminMessage.textContent = '';
    }

    const hasMessages = successMessage.textContent || errorMessage.textContent || loadingMessage.textContent || adminMessage.textContent;
    displayPrompt.style.display = hasMessages ? 'block' : 'none';

    document.getElementById('adminStatus').style.display = isAdminAuthenticated && !isMasterAuthenticated ? 'inline-block' : 'none';
    document.getElementById('masterStatus').style.display = isMasterAuthenticated ? 'inline-block' : 'none';
    document.getElementById('messageLogButton').style.display = isMasterAuthenticated ? 'inline' : 'none';
}

function showPasswordModal(type) {
    const modal = document.createElement('div');
    modal.className = 'password-modal';
    modal.innerHTML = `
        <div class="password-modal-content">
            <h2>Inserir Senha ${type}</h2>
            <input type="password" id="passwordInput" placeholder="Digite a senha">
            <div class="password-modal-buttons">
                <button id="confirmPassword">Confirmar</button>
                <button id="cancelPassword">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'block';

    document.getElementById('confirmPassword').onclick = () => {
        const password = document.getElementById('passwordInput').value;
        if (type === 'ADM') {
            verifyAdminPassword(password);
        } else {
            verifyMasterPassword(password);
        }
        document.body.removeChild(modal);
    };

    document.getElementById('cancelPassword').onclick = () => {
        document.body.removeChild(modal);
        clearMessages();
    };
}

function verifyAdminPassword(password) {
    clearMessages();
    if (password === admi) {
        isAdminAuthenticated = true;
        document.getElementById('successMessage').textContent = '15-Senha ADM confirmada!';
        logMessage(15, 'Senha ADM confirmada!');
        if (currentTable) {
            document.getElementById('columnSelection').innerHTML = '';
            populateColumnSelection();
            renderTablePage();
        }
    } else {
        document.getElementById('errorMessage').textContent = '16-Senha ADM incorreta.';
        logMessage(16, 'Senha ADM incorreta.');
    }
    updateMessages();
}

function verifyMasterPassword(password) {
    clearMessages();
    if (password === mast) {
        isMasterAuthenticated = true;
        isAdminAuthenticated = false; // Master overrides Admin
        document.getElementById('successMessage').textContent = '17-Senha Master confirmada!';
        logMessage(17, 'Senha Master confirmada!');
        if (currentTable) {
            document.getElementById('columnSelection').innerHTML = '';
            populateColumnSelection();
            renderTablePage();
        }
    } else {
        document.getElementById('errorMessage').textContent = '18-Senha Master incorreta.';
        logMessage(18, 'Senha Master incorreta.');
    }
    updateMessages();
}

function toggleControleDisplay() {
    const controleDisplay = document.getElementById('controle_display');
    const toggleButton = document.getElementById('toggleControleButton');
    if (controleDisplay.style.display === 'none') {
        controleDisplay.style.display = 'block';
        toggleButton.textContent = 'Controle ▼';
    } else {
        controleDisplay.style.display = 'none';
        toggleButton.textContent = 'Controle ►';
    }
}

document.getElementById('adminPasswordButton').onclick = () => {
    showPasswordModal('ADM');
};

document.getElementById('masterPasswordButton').onclick = () => {
    showPasswordModal('Master');
};

document.getElementById('downloadLogButton').onclick = () => {
    downloadSecureLog();
};

document.getElementById('printTableButton').onclick = () => {
    downloadTableData();
};

document.getElementById('undoDeleteButton').onclick = () => {
    undoDeleteRows();
};

document.getElementById('messageLogButton').onclick = () => {
    downloadMessageLog();
};

document.getElementById('toggleControleButton').onclick = () => {
    toggleControleDisplay();
};

function openModal(modal) {
    modal.style.display = 'block';
}

function closeModal(modal) {
    modal.style.display = 'none';
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'F5' || (event.ctrlKey && event.key === 'r') || (event.metaKey && event.key === 'r')) {
        event.preventDefault();
        isKeyboardAction = true;
        if (secureLog !== null) {
            openModal(confirmDownloadModal);
        } else {
            window.location.reload();
        }
    }
});

window.addEventListener('beforeunload', (event) => {
    if (allowUnload) {
        allowUnload = false;
        return;
    }
    if (isKeyboardAction) {
        isKeyboardAction = false;
        return;
    }
    if (secureLog !== null) {
        event.preventDefault();
        event.returnValue = '';
        openModal(confirmDownloadModal);
    }
    isAdminAuthenticated = false;
    isMasterAuthenticated = false;
    messageLog = [];
});

document.getElementById('downloadYes').onclick = () => {
    downloadSecureLog();
    allowUnload = true;
    closeModal(confirmDownloadModal);
    window.location.reload();
};

document.getElementById('downloadCancel').onclick = () => {
    closeModal(confirmDownloadModal);
    isKeyboardAction = false;
};

document.getElementById('downloadNo').onclick = () => {
    closeModal(confirmDownloadModal);
    openModal(confirmNoDownloadModal);
};

document.getElementById('noDownloadYes').onclick = () => {
    secureLog = null;
    deletedRows = [];
    allowUnload = true;
    closeModal(confirmNoDownloadModal);
    window.location.reload();
};

document.getElementById('noDownloadNo').onclick = () => {
    closeModal(confirmNoDownloadModal);
    isKeyboardAction = false;
};

function clearMessages() {
    document.getElementById('successMessage').textContent = '';
    document.getElementById('errorMessage').textContent = '';
    document.getElementById('loadingMessage').textContent = '';
    updateMessages();
}

docsButton.onclick = () => {
    window.location.href = 'db_docs.html';
};

function checkRealtimeConnection() {
    if (isRealtimeConnected) {
        document.getElementById('successMessage').textContent = '2-Conectado em tempo real!';
        logMessage(2, 'Conectado em tempo real!');
        document.getElementById('errorMessage').textContent = '';
    } else {
        document.getElementById('successMessage').textContent = '';
        document.getElementById('errorMessage').textContent = '3-Desconectado do tempo real. Tentando reconectar...';
        logMessage(3, 'Desconectado do tempo real. Tentando reconectar...');
    }
    updateMessages();
}

setInterval(checkRealtimeConnection, 10000);

document.getElementById('selectTableButton').onclick = async () => {
    clearMessages();
    const tableName = prompt('Digite o nome da tabela (exemplo: alunos, ongs):');
    if (!tableName) {
        document.getElementById('errorMessage').textContent = '5-Nome da tabela não pode ser vazio.';
        logMessage(5, 'Nome da tabela não pode ser vazio.');
        updateMessages();
        return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        document.getElementById('errorMessage').textContent = '6-Nome da tabela inválido. Use apenas letras, números ou sublinhados.';
        logMessage(6, 'Nome da tabela inválido. Use apenas letras, números ou sublinhados.');
        updateMessages();
        return;
    }
    if (['alunos', 'ongs'].includes(tableName.toLowerCase()) && !isMasterAuthenticated) {
        document.getElementById('errorMessage').textContent = '7-Acesso às tabelas "alunos" e "ongs" requer a senha Master.';
        logMessage(7, 'Acesso às tabelas "alunos" e "ongs" requer a senha Master.');
        updateMessages();
        return;
    }
    isAdminAuthenticated = false; // Reset Admin authentication on table change
    currentTable = tableName;
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (error) {
        document.getElementById('errorMessage').textContent = `8-Erro ao acessar a tabela: ${error.message}`;
        logMessage(8, `Erro ao acessar a tabela: ${error.message}`);
        updateMessages();
        return;
    }
    if (!data || !data.length) {
        document.getElementById('errorMessage').textContent = '9-Tabela vazia. Adicione um registro para começar.';
        logMessage(9, 'Tabela vazia. Adicione um registro para começar.');
        updateMessages();
        return;
    }
    columns = Object.keys(data[0]);
    originalColumnOrder = [...columns];
    visibleColumns = [...columns];
    populatePkSelector(columns);
    populateColumnSelection();
    document.getElementById('pkSelection').style.display = 'block';
    updateMessages();
};

function populatePkSelector(columns) {
    const select = document.getElementById('pkSelect');
    select.innerHTML = '';
    columns.forEach(c => {
        const option = document.createElement('option');
        option.value = c;
        option.textContent = c;
        select.appendChild(option);
    });
}

function populateColumnSelection() {
    const container = document.getElementById('columnSelection');
    container.innerHTML = '<h4>Selecione as colunas a visualizar:</h4>';
    originalColumnOrder.forEach(col => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = visibleColumns.includes(col);
        const isSensitive = SENSITIVE_COLUMNS.test(col);
        if (isSensitive && !isAdminAuthenticated && !isMasterAuthenticated) {
            checkbox.disabled = true;
            label.style.color = 'gray';
        }
        checkbox.onchange = () => {
            if (checkbox.checked) {
                const newVisibleColumns = originalColumnOrder.filter(c => 
                    visibleColumns.includes(c) || c === col
                );
                visibleColumns = newVisibleColumns;
            } else {
                visibleColumns = visibleColumns.filter(c => c !== col);
            }
            generateTableHeader();
            renderTablePage();
        };
        label.appendChild(checkbox);
        label.append(` ${col}`);
        container.appendChild(label);
    });
}

document.getElementById('columnSelectionButton').onclick = () => {
    if (!currentTable) {
        document.getElementById('errorMessage').textContent = '14-Selecione uma tabela primeiro.';
        logMessage(14, 'Selecione uma tabela primeiro.');
        updateMessages();
        return;
    }
    const container = document.getElementById('columnSelection');
    container.style.display = container.style.display === 'block' ? 'none' : 'block';
};

document.getElementById('confirmPkButton-famous').onclick = async () => {
    primaryKey = document.getElementById('pkSelect').value;
    if (!primaryKey) {
        document.getElementById('errorMessage').textContent = '10-Selecione uma chave primária.';
        logMessage(10, 'Selecione uma chave primária.');
        updateMessages();
        return;
    }
    await loadTable();
};

async function checkForDuplicatePk(pkValue, excludeOriginal = null) {
    try {
        let query = supabase.from(currentTable).select(primaryKey).eq(primaryKey, pkValue);
        if (excludeOriginal !== null) {
            query = query.neq(primaryKey, excludeOriginal);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data.length > 0;
    } catch (error) {
        document.getElementById('errorMessage').textContent = `33-Erro ao verificar duplicatas: ${error.message}`;
        logMessage(33, `Erro ao verificar duplicatas: ${error.message}`);
        updateMessages();
        return true;
    }
}

async function loadTable() {
    clearMessages();
    document.getElementById('pkSelection').style.display = 'none';
    document.getElementById('tableContainer').style.display = 'block';
    document.getElementById('tableUtilities').style.display = 'block';
    document.getElementById('printTableButton').style.display = 'inline';
    document.getElementById('undoDeleteButton').style.display = deletedRows.length ? 'inline' : 'none';
    document.getElementById('messageLogButton').style.display = isMasterAuthenticated ? 'inline' : 'none';
    document.getElementById('loadingMessage').style.display = 'block';
    logMessage(1, 'Carregando...');

    if (subscriptionChannel) {
        supabase.removeChannel(subscriptionChannel);
        isRealtimeConnected = false;
    }

    try {
        const { data, error } = await supabase.from(currentTable).select('*');
        if (error) {
            document.getElementById('errorMessage').textContent = `11-Erro ao carregar dados: ${error.message}`;
            logMessage(11, `Erro ao carregar dados: ${error.message}`);
            updateMessages();
            return;
        }
        allData = data;
        filteredData = [...data];
        const pkValues = data.map(r => r[primaryKey]);
        isPkInteger = pkValues.every(v => Number.isInteger(Number(v)));
        lastPkValue = isPkInteger ? Math.max(...pkValues.map(Number).filter(v => !isNaN(v))) : 0;

        if (isPkInteger) {
            currentSort = { column: primaryKey, order: 'desc' };
        } else {
            currentSort = { column: primaryKey, order: 'asc' };
        }
        initialSort = { ...currentSort };

        if (visibleColumns.length === 0) {
            document.getElementById('errorMessage').textContent = '13-Nenhuma coluna selecionada para visualização.';
            logMessage(13, 'Nenhuma coluna selecionada para visualização.');
            updateMessages();
            return;
        }

        generateTableHeader();
        sortAndRender();
        updateMessages();

        subscriptionChannel = supabase.channel(`${currentTable}-channel`)
            .on('postgres_changes', { event: '*', schema: 'public', table: currentTable }, payload => {
                console.log('Mudança detectada:', payload);
                loadTable();
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') {
                    isRealtimeConnected = true;
                    checkRealtimeConnection();
                } else {
                    isRealtimeConnected = false;
                    checkRealtimeConnection();
                }
            });
    } catch (error) {
        document.getElementById('errorMessage').textContent = `12-Erro ao carregar tabela: ${error.message}`;
        logMessage(12, `Erro ao carregar tabela: ${error.message}`);
    } finally {
        document.getElementById('loadingMessage').style.display = 'none';
        updateMessages();
    }
}

function generateTableHeader() {
    const thead = document.getElementById('dynamicTableHead');
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    visibleColumns.forEach(col => {
        if (SENSITIVE_COLUMNS.test(col) && !isAdminAuthenticated && !isMasterAuthenticated) return;
        const th = document.createElement('th');
        th.textContent = col;
        th.onclick = () => {
            currentSort = {
                column: col,
                order: currentSort.column === col && currentSort.order === 'asc' ? 'desc' : 'asc'
            };
            sortAndRender();
        };
        tr.appendChild(th);
    });
    const thAction = document.createElement('th');
    thAction.textContent = 'Ações';
    tr.appendChild(thAction);
    thead.appendChild(tr);
}

function sortAndRender() {
    const { column, order } = currentSort;
    if (!visibleColumns.includes(column) && currentSort !== initialSort) {
        currentSort.column = primaryKey;
        currentSort.order = isPkInteger ? 'desc' : 'asc';
    }
    filteredData.sort((a, b) => {
        let valA = a[currentSort.column], valB = b[currentSort.column];
        valA = valA !== null ? valA.toString().toLowerCase() : '';
        valB = valB !== null ? valB.toString().toLowerCase() : '';
        if (!isNaN(valA) && !isNaN(valB)) {
            valA = Number(valA);
            valB = Number(valB);
        }
        return (valA > valB ? 1 : valA < valB ? -1 : 0) * (order === 'asc' ? 1 : -1);
    });
    renderTablePage();
}

function renderTablePage() {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredData.slice(start, end);
    const tbody = document.getElementById('dynamicTableBody');
    tbody.innerHTML = '';
    pageData.forEach(record => {
        const tr = document.createElement('tr');
        visibleColumns.forEach(col => {
            if (SENSITIVE_COLUMNS.test(col) && !isAdminAuthenticated && !isMasterAuthenticated) return;
            const td = document.createElement('td');
            td.textContent = record[col] ?? '';
            tr.appendChild(td);
        });
        const actionTd = document.createElement('td');
        if (isAdminAuthenticated || isMasterAuthenticated) {
            actionTd.innerHTML = `
                <button onclick="editInline('${record[primaryKey]}')">Editar</button>
                <button onclick="deleteRecord('${record[primaryKey]}')">Excluir</button>
            `;
        } else {
            actionTd.textContent = 'Ações desabilitadas';
        }
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
    });
    renderPaginationControls();
}

function renderPaginationControls() {
    const total = filteredData.length;
    const totalPages = Math.ceil(total / rowsPerPage);
    const container = document.getElementById('paginationControls');
    container.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = 'pagination-btn';
        btn.disabled = i === currentPage;
        btn.onclick = () => { currentPage = i; renderTablePage(); };
        container.appendChild(btn);
    }
}

document.getElementById('globalSearchInput').oninput = (e) => {
    const val = e.target.value.toLowerCase();
    filteredData = allData.filter(row =>
        Object.values(row).some(v => v?.toString().toLowerCase().includes(val))
    );
    currentPage = 1;
    sortAndRender();
};

document.getElementById('restoreViewButton').onclick = () => {
    filteredData = [...allData];
    visibleColumns = [...originalColumnOrder];
    currentSort = { ...initialSort };
    document.getElementById('columnSelection').innerHTML = '';
    populateColumnSelection();
    generateTableHeader();
    sortAndRender();
    currentPage = 1;
    document.getElementById('printTableButton').style.display = 'inline';
    document.getElementById('undoDeleteButton').style.display = deletedRows.length ? 'inline' : 'none';
    document.getElementById('messageLogButton').style.display = isMasterAuthenticated ? 'inline' : 'none';
    updateMessages();
};

document.getElementById('addNewButton').onclick = () => {
    clearMessages();
    document.getElementById('dynamicFormFields').innerHTML = '';
    columns.forEach(col => {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `field_${col}`;
        input.value = col === primaryKey && isPkInteger ? lastPkValue + 1 : '';
        const label = document.createElement('label');
        label.textContent = `${col}: `;
        label.appendChild(input);
        document.getElementById('dynamicFormFields').appendChild(label);
    });
    originalPkValue = null;
    document.getElementById('dynamicForm').style.display = 'block';
};

document.getElementById('saveButton').onclick = async () => {
    clearMessages();
    const record = {};
    columns.forEach(col => record[col] = document.getElementById(`field_${col}`).value || null);

    const isUpdate = originalPkValue !== null;

    const pkValue = record[primaryKey];
    const hasDuplicate = await checkForDuplicatePk(pkValue, isUpdate ? originalPkValue : null);
    if (hasDuplicate) {
        document.getElementById('errorMessage').textContent = `24-Erro: O valor "${pkValue}" para a chave primária já existe na tabela. Escolha outro valor.`;
        logMessage(24, `Erro: O valor "${pkValue}" para a chave primária já existe na tabela. Escolha outro valor.`);
        updateMessages();
        return;
    }

    try {
        if (isUpdate) {
            const { error: deleteError } = await supabase.from(currentTable).delete().eq(primaryKey, originalPkValue);
            if (deleteError) throw deleteError;
            const { error: insertError } = await supabase.from(currentTable).insert([record]);
            if (insertError) throw insertError;
        } else {
            const { error } = await supabase.from(currentTable).insert([record]);
            if (error) throw error;
        }
        document.getElementById('dynamicForm').style.display = 'none';
        originalPkValue = null;
        await loadTable();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `25-Erro ao salvar registro: ${error.message}`;
        logMessage(25, `Erro ao salvar registro: ${error.message}`);
        updateMessages();
    }
};

document.getElementById('cancelButton').onclick = () => {
    clearMessages();
    document.getElementById('dynamicForm').style.display = 'none';
    originalPkValue = null;
    updateMessages();
};

async function editInline(id) {
    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        document.getElementById('errorMessage').textContent = '26-Ação de edição requer senha ADM ou Master.';
        logMessage(26, 'Ação de edição requer senha ADM ou Master.');
        updateMessages();
        return;
    }
    clearMessages();
    try {
        const { data, error } = await supabase.from(currentTable).select('*').eq(primaryKey, id);
        if (error || !data || !data.length) {
            document.getElementById('errorMessage').textContent = `27-Erro ao buscar registro para edição: ${error?.message || 'Registro não encontrado'}`;
            logMessage(27, `Erro ao buscar registro para edição: ${error?.message || 'Registro não encontrado'}`);
            updateMessages();
            return;
        }
        const rowIndex = filteredData.findIndex(r => r[primaryKey] == id);
        const row = document.querySelector(`#dynamicTableBody tr:nth-child(${rowIndex + 1})`);
        row.innerHTML = '';
        visibleColumns.forEach(col => {
            if (SENSITIVE_COLUMNS.test(col) && !isAdminAuthenticated && !isMasterAuthenticated) return;
            const td = document.createElement('td');
            td.innerHTML = `<input type="text" id="edit_${col}" value="${data[0][col] ?? ''}" />`;
            row.appendChild(td);
        });
        const tdActions = document.createElement('td');
        tdActions.innerHTML = `<button onclick="confirmEdit('${id}')">Salvar</button><button onclick="loadTable()">Cancelar</button>`;
        row.appendChild(tdActions);
        originalPkValue = id;
    } catch (error) {
        document.getElementById('errorMessage').textContent = `28-Erro ao preparar edição: ${error.message}`;
        logMessage(28, `Erro ao preparar edição: ${error.message}`);
        updateMessages();
    }
}

async function confirmEdit(id) {
    clearMessages();
    const updated = {};
    columns.forEach(col => {
        const input = document.getElementById(`edit_${col}`);
        updated[col] = input ? input.value || null : allData.find(r => r[primaryKey] == id)[col];
    });

    const pkValue = updated[primaryKey];
    const hasDuplicate = await checkForDuplicatePk(pkValue, id);
    if (hasDuplicate) {
        document.getElementById('errorMessage').textContent = `24-Erro: O valor "${pkValue}" para a chave primária já existe na tabela. Escolha outro valor.`;
        logMessage(24, `Erro: O valor "${pkValue}" para a chave primária já existe na tabela. Escolha outro valor.`);
        updateMessages();
        return;
    }

    try {
        const { error: deleteError } = await supabase.from(currentTable).delete().eq(primaryKey, id);
        if (deleteError) throw deleteError;
        const { error: insertError } = await supabase.from(currentTable).insert([updated]);
        if (insertError) throw insertError;
        originalPkValue = null;
        await loadTable();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `29-Erro ao salvar edição: ${error.message}`;
        logMessage(29, `Erro ao salvar edição: ${error.message}`);
        updateMessages();
    }
}

async function deleteRecord(id) {
    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        document.getElementById('errorMessage').textContent = '30-Ação de exclusão requer senha ADM ou Master.';
        logMessage(30, 'Ação de exclusão requer senha ADM ou Master.');
        updateMessages();
        return;
    }
    clearMessages();
    if (!confirm(`Deseja excluir o registro ${id}?`)) return;
    try {
        const { data, error: fetchError } = await supabase.from(currentTable).select('*').eq(primaryKey, id);
        if (fetchError || !data || !data.length) {
            document.getElementById('errorMessage').textContent = `31-Erro ao buscar registro para exclusão: ${fetchError?.message || 'Registro não encontrado'}`;
            logMessage(31, `Erro ao buscar registro para exclusão: ${fetchError?.message || 'Registro não encontrado'}`);
            updateMessages();
            return;
        }
        updateSecureLog(data[0]);
        deletedRows.push(data[0]);
        document.getElementById('undoDeleteButton').style.display = 'inline';
        const { error } = await supabase.from(currentTable).delete().eq(primaryKey, id);
        if (error) throw error;
        await loadTable();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `32-Erro ao excluir registro: ${error.message}`;
        logMessage(32, `Erro ao excluir registro: ${error.message}`);
        updateMessages();
    }
}

document.getElementById('loadingMessage').style.display = 'none';
updateMessages();