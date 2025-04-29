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

const ADMIN_PASSWORDS = {
    'zong_1': '66270413545556676767',
    'zong_2': '65656527041368545557'
};
const MASTER_PASSWORD = '65656527041368545556';
const mast = deco(MASTER_PASSWORD).trim();
const SENSITIVE_COLUMNS = /^(.*_)?(email|e-mail|mail|endereco|end|local|logradouro|rua|tel|telefone|fone|cel|celular|mobile|_email|_e-mail|_endereco|_end|_tel|numero_telefone|numero_cel|_celular|contato|contact|whatsapp)(_.*)?$/i;
const TABLES_TO_CHECK = ['zong_1', 'zong_2'];
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

async function getOngsByCpf(cpf) {
    if (!cpf || typeof cpf !== 'string' || cpf.trim() === '') {
        logMessage(1, 'Consulta de ONGs por CPF ignorada: CPF inválido');
        return '';
    }
    const normalizedCpf = cpf.trim().replace(/[\.\-\s]/g, '').toLowerCase();
    try {
        const ongList = [];
        for (const table of TABLES_TO_CHECK) {
            const { data, error } = await supabase
                .from(table)
                .select('CPF');
            if (error) {
                logMessage(1, `Falha ao consultar CPF em ${table}: ${error.message}`);
                continue;
            }
            if (data && data.length > 0) {
                const match = data.some(row => {
                    const tableCpf = row.CPF && typeof row.CPF === 'string'
                        ? row.CPF.trim().replace(/[\.\-\s]/g, '').toLowerCase()
                        : '';
                    return tableCpf === normalizedCpf;
                });
                if (match) {
                    ongList.push(table);
                }
            }
        }
        logMessage(1, `Consulta de ONGs por CPF concluída: ${ongList.join(', ') || 'Nenhuma ONG'}`);
        return ongList.join(', ') || '';
    } catch (error) {
        logMessage(1, `Erro geral na consulta de ONGs por CPF: ${error.message}`);
        return '';
    }
}

async function getTotalGanhoHorasByCpf(cpf) {
    if (!cpf || typeof cpf !== 'string' || cpf.trim() === '') {
        logMessage(1, 'Consulta de ganho_horas por CPF ignorada: CPF inválido');
        return 0;
    }
    const normalizedCpf = cpf.trim().replace(/[\.\-\s]/g, '').toLowerCase();
    let totalHoras = 0;
    try {
        for (const table of TABLES_TO_CHECK) {
            const { data, error } = await supabase
                .from(table)
                .select('CPF, ganho_horas');
            if (error) {
                logMessage(1, `Falha ao consultar ganho_horas em ${table}: ${error.message}`);
                continue;
            }
            if (data && data.length > 0) {
                data.forEach(row => {
                    const tableCpf = row.CPF && typeof row.CPF === 'string'
                        ? row.CPF.trim().replace(/[\.\-\s]/g, '').toLowerCase()
                        : '';
                    if (tableCpf === normalizedCpf) {
                        const horas = typeof row.ganho_horas === 'number'
                            ? row.ganho_horas
                            : parseInt(row.ganho_horas, 10);
                        if (!isNaN(horas)) {
                            totalHoras += horas;
                        }
                    }
                });
            }
        }
        logMessage(1, `Consulta de ganho_horas por CPF concluída: ${totalHoras} horas`);
        return totalHoras;
    } catch (error) {
        logMessage(1, `Erro geral na consulta de ganho_horas por CPF: ${error.message}`);
        return 0;
    }
}

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
        document.getElementById('errorMessage').textContent = '16-Nenhum log de mensagens para imprimir.';
        logMessage(16, 'Nenhum log de mensagens para imprimir.');
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
    logMessage(1, 'Download do log de mensagens concluído com sucesso');
}

function updateSecureLog(record) {
    const timestamp = getTimestamp();
    if (secureLog === null) {
        secureLog = `SecureLog ${timestamp}\n`;
        document.getElementById('downloadLogButton').style.display = 'inline';
        logMessage(1, 'Inicialização do log seguro concluída');
    }
    const visibleRecord = {};
    visibleColumns.forEach(col => {
        visibleRecord[col] = record[col];
    });
    secureLog += `[${timestamp}] Tabela: ${currentTable} Dados excluídos: ${JSON.stringify(visibleRecord)}\n`;
    logMessage(1, `Registro excluído adicionado ao log seguro: ${currentTable}`);
}

function downloadSecureLog() {
    if (secureLog === null) {
        document.getElementById('errorMessage').textContent = '29-Nenhum log seguro para baixar.';
        logMessage(29, 'Nenhum log seguro para baixar.');
        updateMessages();
        return;
    }
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
    logMessage(1, 'Download do log seguro concluído com sucesso');
}

function downloadTableData() {
    if (!currentTable || !filteredData.length) {
        document.getElementById('errorMessage').textContent = '15-Nenhuma tabela ou dados para imprimir.';
        logMessage(15, 'Nenhuma tabela ou dados para imprimir.');
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
    logMessage(1, 'Download dos dados da tabela concluído com sucesso');
}
function updateMessages() {
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const loadingMessage = document.getElementById('loadingMessage');
    const adminMessage = document.getElementById('adminMessage');
    const displayPrompt = document.getElementById('display_prompt');

    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        adminMessage.textContent = '5-Algumas funcionalidades e colunas estão desabilitadas. Insira a senha ADM ou Master.';
        logMessage(5, 'Algumas funcionalidades e colunas estão desabilitadas. Insira a senha ADM ou Master.');
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
    logMessage(45, `Modal password-modal aberto.`);

    document.getElementById('confirmPassword').onclick = () => {
        const password = document.getElementById('passwordInput').value;
        if (type === 'ADM') {
            verifyAdminPassword(password);
        } else {
            verifyMasterPassword(password);
        }
        document.body.removeChild(modal);
        logMessage(46, `Modal password-modal fechado.`);
    };

    document.getElementById('cancelPassword').onclick = () => {
        document.body.removeChild(modal);
        clearMessages();
        logMessage(46, `Modal password-modal fechado.`);
    };
}

function verifyAdminPassword(password) {
    clearMessages();
    const adminPassword = ADMIN_PASSWORDS[currentTable];
    if (!adminPassword) {
        document.getElementById('errorMessage').textContent = '41-Tabela não configurada para acesso ADM.';
        logMessage(41, 'Tabela não configurada para acesso ADM.');
        updateMessages();
        return;
    }
    if (password === deco(adminPassword).trim()) {
        isAdminAuthenticated = true;
        document.getElementById('successMessage').textContent = '27-Senha ADM confirmada!';
        logMessage(27, 'Senha ADM confirmada!');
        if (currentTable) {
            document.getElementById('columnSelection').innerHTML = '';
            populateColumnSelection();
            renderTablePage();
        }
        document.getElementById('restoreViewButton').click();
    } else {
        document.getElementById('errorMessage').textContent = '25-Senha ADM incorreta.';
        logMessage(25, 'Senha ADM incorreta.');
    }
    updateMessages();
}

function verifyMasterPassword(password) {
    clearMessages();
    if (password === mast) {
        isMasterAuthenticated = true;
        isAdminAuthenticated = false;
        document.getElementById('successMessage').textContent = '28-Senha Master confirmada!';
        logMessage(28, 'Senha Master confirmada!');
        if (currentTable) {
            document.getElementById('columnSelection').innerHTML = '';
            populateColumnSelection();
            renderTablePage();
        }
        document.getElementById('restoreViewButton').click();
    } else {
        document.getElementById('errorMessage').textContent = '26-Senha Master incorreta.';
        logMessage(26, 'Senha Master incorreta.');
    }
    updateMessages();
}

function toggleControleDisplay() {
    const controleDisplay = document.getElementById('controle_display');
    const toggleButton = document.getElementById('toggleControleButton');
    if (controleDisplay.style.display === 'none') {
        controleDisplay.style.display = 'block';
        toggleButton.textContent = 'Controle ▼';
        logMessage(47, 'Painel de controle exibido.');
    } else {
        controleDisplay.style.display = 'none';
        toggleButton.textContent = 'Controle ►';
        logMessage(47, 'Painel de controle ocultado.');
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
    logMessage(45, `Modal ${modal.id} aberto.`);
}

function closeModal(modal) {
    modal.style.display = 'none';
    logMessage(46, `Modal ${modal.id} fechado.`);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'F5' || (event.ctrlKey && event.key === 'r') || (event.metaKey && event.key === 'r')) {
        event.preventDefault();
        isKeyboardAction = true;
        if (secureLog !== null) {
            openModal(confirmDownloadModal);
        } else {
            logMessage(50, 'Página recarregada.');
            window.location.reload();
        }
    }
});

window.addEventListener('beforeunload', (event) => {
    if (allowUnload) {
        allowUnload = false;
        logMessage(1, 'Saída permitida após confirmação');
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
    logMessage(49, 'Sessão reiniciada ao sair da página.');
});

document.getElementById('downloadYes').onclick = () => {
    downloadSecureLog();
    allowUnload = true;
    closeModal(confirmDownloadModal);
    logMessage(50, 'Página recarregada.');
    window.location.reload();
};

document.getElementById('downloadCancel').onclick = () => {
    closeModal(confirmDownloadModal);
    isKeyboardAction = false;
    logMessage(1, 'Download do log seguro cancelado');
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
    logMessage(50, 'Página recarregada.');
    window.location.reload();
};

document.getElementById('noDownloadNo').onclick = () => {
    closeModal(confirmNoDownloadModal);
    isKeyboardAction = false;
    logMessage(1, 'Recarregamento sem salvar log seguro cancelado');
};

function clearMessages() {
    document.getElementById('successMessage').textContent = '';
    document.getElementById('errorMessage').textContent = '';
    document.getElementById('loadingMessage').textContent = '';
    logMessage(1, 'Mensagens limpas');
    updateMessages();
}

docsButton.onclick = () => {
    logMessage(48, 'Navegação para página de documentação.');
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
        document.getElementById('errorMessage').textContent = '4-Selecione uma tabela primeiro.';
        logMessage(4, 'Selecione uma tabela primeiro.');
        updateMessages();
        return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        document.getElementById('errorMessage').textContent = '10-Nome da tabela inválido. Use apenas letras, números ou sublinhados.';
        logMessage(10, 'Nome da tabela inválido. Use apenas letras, números ou sublinhados.');
        updateMessages();
        return;
    }
    if (['alunos', 'ongs'].includes(tableName.toLowerCase()) && !isMasterAuthenticated) {
        document.getElementById('errorMessage').textContent = '11-Acesso às tabelas "alunos" e "ongs" requer a senha Master.';
        logMessage(11, 'Acesso às tabelas "alunos" e "ongs" requer a senha Master.');
        updateMessages();
        return;
    }
    isAdminAuthenticated = false;
    currentTable = tableName;
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (error) {
        document.getElementById('errorMessage').textContent = `20-Erro ao acessar a tabela: ${error.message}`;
        logMessage(20, `Erro ao acessar a tabela: ${error.message}`);
        updateMessages();
        return;
    }
    if (!data || !data.length) {
        document.getElementById('errorMessage').textContent = '12-Tabela vazia. Adicione um registro para começar.';
        logMessage(12, 'Tabela vazia. Adicione um registro para começar.');
        updateMessages();
        return;
    }
    columns = Object.keys(data[0]);
    originalColumnOrder = [...columns];
    visibleColumns = [...columns];
    populatePkSelector(columns);
    populateColumnSelection();
    document.getElementById('pkSelection').style.display = 'block';
    logMessage(1, `Tabela ${tableName} selecionada com sucesso`);
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
    logMessage(1, 'Seletor de chave primária populado');
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
                logMessage(6, `Coluna ${col} adicionada da visualização.`);
            } else {
                visibleColumns = visibleColumns.filter(c => c !== col);
                logMessage(6, `Coluna ${col} removida da visualização.`);
            }
            generateTableHeader();
            renderTablePage();
        };
        label.appendChild(checkbox);
        label.append(` ${col}`);
        container.appendChild(label);
    });
    logMessage(1, 'Seleção de colunas populada');
}

document.getElementById('columnSelectionButton').onclick = () => {
    if (!currentTable) {
        document.getElementById('errorMessage').textContent = '4-Selecione uma tabela primeiro.';
        logMessage(4, 'Selecione uma tabela primeiro.');
        updateMessages();
        return;
    }
    const container = document.getElementById('columnSelection');
    container.style.display = container.style.display === 'block' ? 'none' : 'block';
    logMessage(1, `Seleção de colunas ${container.style.display === 'block' ? 'exibida' : 'ocultada'}`);
};

document.getElementById('confirmPkButton-famous').onclick = async () => {
    if (!currentTable) {
        document.getElementById('errorMessage').textContent = '4-Selecione uma tabela primeiro.';
        logMessage(4, 'Selecione uma tabela primeiro.');
        updateMessages();
        return;
    }
    primaryKey = document.getElementById('pkSelect').value;
    if (!primaryKey) {
        document.getElementById('errorMessage').textContent = '13-Selecione uma chave primária.';
        logMessage(13, 'Selecione uma chave primária.');
        updateMessages();
        return;
    }
    logMessage(1, `Chave primária ${primaryKey} confirmada`);
    await loadTable();
};

async function checkForDuplicatePk(pkValue, excludeOriginal = null) {
    try {
        let tablePrimaryKey;
        if (currentTable === 'alunos') {
            tablePrimaryKey = 'aluno_ID';
        } else if (TABLES_TO_CHECK.includes(currentTable)) {
            tablePrimaryKey = 'numero_aluno';
        } else {
            throw new Error(`Unknown table: ${currentTable}`);
        }

        let query = supabase.from(currentTable).select(tablePrimaryKey).eq(tablePrimaryKey, pkValue);
        if (excludeOriginal !== null) {
            query = query.neq(tablePrimaryKey, excludeOriginal);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data.length > 0;
    } catch (error) {
        document.getElementById('errorMessage').textContent = `32-Erro ao verificar duplicatas: ${error.message}`;
        logMessage(32, `Erro ao verificar duplicatas: ${error.message}`);
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
    document.getElementById('loadingMessage').textContent = '1-Carregando...';
    logMessage(1, 'Carregando...');

    if (currentTable === 'alunos') {
        document.getElementById('alunosLoadingIndicator').style.display = 'flex';
    }

    if (subscriptionChannel) {
        supabase.removeChannel(subscriptionChannel);
        isRealtimeConnected = false;
        logMessage(3, 'Conexão em tempo real anterior encerrada');
    }

    if (window.ongsUpdateInterval) {
        clearInterval(window.ongsUpdateInterval);
        window.ongsUpdateInterval = null;
        logMessage(1, 'Intervalo de atualização periódica encerrado');
    }

    let hasConnected = false;
    let hasFailed = false;
    const additionalSubscriptions = [];

    try {
        const { data, error } = await supabase.from(currentTable).select('*');
        if (error) {
            document.getElementById('errorMessage').textContent = `19-Erro ao carregar dados: ${error.message}`;
            logMessage(19, `Erro ao carregar dados: ${error.message}`);
            updateMessages();
            return;
        }
        allData = data;
        filteredData = [...data];
        if (currentTable === 'alunos') {
            let hasErrors = false;

            document.getElementById('loadingMessage').textContent = '34-Inicio de comparação das informações de outras tabelas';
            logMessage(34, 'Inicio de comparação das informações de outras tabelas');
            updateMessages();

            for (let row of filteredData) {
                if (row.CPF) {
                    try {
                        row.ongs_registradas = await getOngsByCpf(row.CPF);
                    } catch (error) {
                        hasErrors = true;
                        row.ongs_registradas = '';
                    }

                    let totalHoras = 0;
                    try {
                        totalHoras = await getTotalGanhoHorasByCpf(row.CPF);
                        row.ganho_horas = totalHoras;
                        const { error: updateError } = await supabase
                            .from('alunos')
                            .update({ ganho_horas: totalHoras })
                            .eq('aluno_ID', row.aluno_ID);
                        if (updateError) throw updateError;
                    } catch (error) {
                        hasErrors = true;
                    }
                } else {
                    row.ongs_registradas = '';
                    row.ganho_horas = 0;
                    try {
                        const { error: updateError } = await supabase
                            .from('alunos')
                            .update({ ganho_horas: 0 })
                            .eq('aluno_ID', row.aluno_ID);
                        if (updateError) throw updateError;
                    } catch (error) {
                        hasErrors = true;
                    }
                }
            }

            if (hasErrors) {
                document.getElementById('errorMessage').textContent = '36-concluído, mas com alguns erros em {"ongs_registradas" ou "ganho_horas"}';
                logMessage(36, 'concluído, mas com alguns erros em {"ongs_registradas" ou "ganho_horas"}');
            } else {
                document.getElementById('successMessage').textContent = '35-100% checagem de tabelas concluído';
                logMessage(35, '100% checagem de tabelas concluído');
            }
            updateMessages();

            window.ongsUpdateInterval = setInterval(async () => {
                if (currentTable !== 'alunos') return;
                try {
                    let periodicHasErrors = false;

                    document.getElementById('loadingMessage').textContent = '34-Inicio de comparação das informações de outras tabelas';
                    logMessage(34, 'Inicio de comparação das informações de outras tabelas');
                    updateMessages();

                    const updatedData = [...filteredData];
                    for (let row of updatedData) {
                        if (row.CPF) {
                            try {
                                row.ongs_registradas = await getOngsByCpf(row.CPF);
                            } catch (error) {
                                periodicHasErrors = true;
                                row.ongs_registradas = '';
                            }

                            let totalHoras = 0;
                            try {
                                totalHoras = await getTotalGanhoHorasByCpf(row.CPF);
                                row.ganho_horas = totalHoras;
                                const { error: updateError } = await supabase
                                    .from('alunos')
                                    .update({ ganho_horas: totalHoras })
                                    .eq('aluno_ID', row.aluno_ID);
                                if (updateError) throw updateError;
                            } catch (error) {
                                periodicHasErrors = true;
                            }
                        } else {
                            row.ongs_registradas = '';
                            row.ganho_horas = 0;
                            try {
                                const { error: updateError } = await supabase
                                    .from('alunos')
                                    .update({ ganho_horas: 0 })
                                    .eq('aluno_ID', row.aluno_ID);
                                if (updateError) throw updateError;
                            } catch (error) {
                                periodicHasErrors = true;
                            }
                        }
                    }

                    filteredData = updatedData;

                    if (periodicHasErrors) {
                        document.getElementById('errorMessage').textContent = '36-concluído, mas com alguns erros em {"ongs_registradas" ou "ganho_horas"}';
                        logMessage(36, 'concluído, mas com alguns erros em {"ongs_registradas" ou "ganho_horas"}');
                    } else {
                        document.getElementById('successMessage').textContent = '35-100% checagem de tabelas concluído';
                        logMessage(35, '100% checagem de tabelas concluído');
                    }
                    updateMessages();

                    sortAndRender();
                } catch (error) {
                    console.error('Periodic update failed:', error);
                }
            }, 60000);
            logMessage(1, 'Intervalo de atualização periódica iniciado');
        }
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
            document.getElementById('errorMessage').textContent = '14-Nenhuma coluna selecionada para visualização.';
            logMessage(14, 'Nenhuma coluna selecionada para visualização.');
            updateMessages();
            return;
        }

        generateTableHeader();
        sortAndRender();
        updateMessages();

        subscriptionChannel = supabase.channel(`${currentTable}-channel`)
            .on('postgres_changes', { event: '*', schema: 'public', table: currentTable }, payload => {
                loadTable();
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED' && !hasConnected) {
                    isRealtimeConnected = true;
                    checkRealtimeConnection();
                    hasConnected = true;
                } else if (status !== 'SUBSCRIBED' && !hasFailed) {
                    isRealtimeConnected = false;
                    checkRealtimeConnection();
                    hasFailed = true;
                }
            });
        logMessage(1, `Inscrição em tempo real para ${currentTable} iniciada`);

        if (currentTable === 'alunos') {
            TABLES_TO_CHECK.forEach(table => {
                const channel = supabase.channel(`${table}-channel`)
                    .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
                        loadTable();
                    })
                    .subscribe(status => {
                        if (status === 'SUBSCRIBED' && !hasConnected) {
                            hasConnected = true;
                        } else if (status !== 'SUBSCRIBED' && !hasFailed) {
                            hasFailed = true;
                        }
                    });
                additionalSubscriptions.push(channel);
                logMessage(1, `Inscrição em tempo real para ${table} iniciada`);
            });
        }

        logMessage(1, `Tabela ${currentTable} carregada com sucesso`);
    } catch (error) {
        document.getElementById('errorMessage').textContent = `19-Erro ao carregar dados: ${error.message}`;
        logMessage(19, `Erro ao carregar dados: ${error.message}`);
    } finally {
        document.getElementById('loadingMessage').style.display = 'none';
        document.getElementById('alunosLoadingIndicator').style.display = 'none';
        if (currentTable !== 'alunos') {
            additionalSubscriptions.forEach(channel => supabase.removeChannel(channel));
            logMessage(1, 'Inscrições adicionais em tempo real encerradas');
        }
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
            logMessage(9, `Tabela ordenada por ${col} (${currentSort.order}).`);
        };
        tr.appendChild(th);
    });
    if (currentTable === 'alunos') {
        const th = document.createElement('th');
        th.textContent = 'ongs_registradas';
        tr.appendChild(th);
    }
    const thAction = document.createElement('th');
    thAction.textContent = 'Ações';
    tr.appendChild(thAction);
    thead.appendChild(tr);
    logMessage(1, 'Cabeçalho da tabela gerado');
}

function sortAndRender() {
    const { column, order } = currentSort;
    if (!visibleColumns.includes(column) && currentSort !== initialSort) {
        currentSort.column = primaryKey;
        currentSort.order = isPkInteger ? 'desc' : 'asc';
        logMessage(1, 'Ordenação revertida para chave primária padrão');
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
    logMessage(9, 'Tabela ordenada e renderizada');
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
        if (currentTable === 'alunos') {
            const td = document.createElement('td');
            td.textContent = record.ongs_registradas || '';
            tr.appendChild(td);
        }
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
    logMessage(7, `Página ${currentPage} da tabela renderizada.`);
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
        btn.onclick = () => {
            currentPage = i;
            renderTablePage();
            logMessage(7, `Navegação para página ${i}.`);
        };
        container.appendChild(btn);
    }
    logMessage(1, 'Controles de paginação renderizados');
}

document.getElementById('globalSearchInput').oninput = (e) => {
    const val = e.target.value.toLowerCase();
    filteredData = allData.filter(row =>
        Object.values(row).some(v => v?.toString().toLowerCase().includes(val))
    );
    currentPage = 1;
    sortAndRender();
    logMessage(8, `Pesquisa global realizada: "${val}".`);
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
    logMessage(1, 'Visualização da tabela restaurada');
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
    logMessage(1, 'Formulário para novo registro aberto');
};

document.getElementById('saveButton').onclick = async () => {
    clearMessages();
    const record = {};
    columns.forEach(col => record[col] = document.getElementById(`field_${col}`).value || null);

    const isUpdate = originalPkValue !== null;

    const pkValue = record[primaryKey];
    const hasDuplicate = await checkForDuplicatePk(pkValue, isUpdate ? originalPkValue : null);
    if (hasDuplicate) {
        document.getElementById('errorMessage').textContent = `18-O valor "${pkValue}" para a chave primária já existe na tabela.`;
        logMessage(18, `O valor "${pkValue}" para a chave primária já existe na tabela.`);
        updateMessages();
        return;
    }

    try {
        let insertedData = null;
        if (isUpdate) {
            const { error: deleteError } = await supabase.from(currentTable).delete().eq(primaryKey, originalPkValue);
            if (deleteError) throw deleteError;
            const { data, error: insertError } = await supabase.from(currentTable).insert([record]).select();
            if (insertError) throw insertError;
            insertedData = data;
            logMessage(1, `Registro atualizado com sucesso na tabela ${currentTable}`);
        } else {
            const { data, error } = await supabase.from(currentTable).insert([record]).select();
            if (error) throw error;
            insertedData = data;
            logMessage(1, `Registro adicionado com sucesso na tabela ${currentTable}`);

            if (TABLES_TO_CHECK.includes(currentTable)) {
                const cpfValue = record['CPF'];
                if (!cpfValue) {
                    document.getElementById('errorMessage').textContent = '37-CPF não encontrado no registro.';
                    logMessage(37, 'CPF não encontrado no registro.');
                    updateMessages();
                    return;
                }

                const normalizedCpf = cpfValue.trim().replace(/[\.\-\s]/g, '').toLowerCase();

                const { data: existingAluno, error: fetchError } = await supabase
                    .from('alunos')
                    .select('aluno_ID')
                    .eq('CPF', normalizedCpf);

                if (fetchError) {
                    logMessage(32, `Erro ao verificar duplicatas em alunos: ${fetchError.message}`);
                    updateMessages();
                } else if (!existingAluno || existingAluno.length === 0) {
                    const { data: allAlunos, error: fetchAllError } = await supabase
                        .from('alunos')
                        .select('aluno_ID');

                    if (fetchAllError) {
                        document.getElementById('errorMessage').textContent = `38-Erro ao buscar aluno_IDs para calcular novo ID: ${fetchAllError.message}`;
                        logMessage(38, `Erro ao buscar aluno_IDs para calcular novo ID: ${fetchAllError.message}`);
                        updateMessages();
                    } else {
                        const maxAlunoId = allAlunos.length > 0
                            ? Math.max(...allAlunos.map(row => parseInt(row.aluno_ID, 10)))
                            : 0;
                        const newAlunoId = maxAlunoId + 1;

                        const alunoRecord = { ...record };
                        delete alunoRecord['numero_aluno'];
                        delete alunoRecord['descricao'];
                        alunoRecord['aluno_ID'] = newAlunoId;

                        const { error: alunoInsertError } = await supabase
                            .from('alunos')
                            .insert([alunoRecord]);

                        if (alunoInsertError) {
                            document.getElementById('errorMessage').textContent = `39-Erro ao adicionar registro à tabela alunos: ${alunoInsertError.message}`;
                            logMessage(39, `Erro ao adicionar registro à tabela alunos: ${alunoInsertError.message}`);
                            updateMessages();
                        } else {
                            logMessage(1, `Registro adicionado à tabela alunos com aluno_ID: ${newAlunoId}`);
                        }
                    }
                }

                const totalHoras = await getTotalGanhoHorasByCpf(normalizedCpf);
                const { error: updateError } = await supabase
                    .from('alunos')
                    .update({ ganho_horas: totalHoras })
                    .eq('CPF', normalizedCpf);

                if (updateError) {
                    document.getElementById('errorMessage').textContent = `40-Erro ao atualizar ganho_horas em alunos: ${updateError.message}`;
                    logMessage(40, `Erro ao atualizar ganho_horas em alunos: ${updateError.message}`);
                    updateMessages();
                } else {
                    logMessage(1, `ganho_horas atualizado em alunos para CPF: ${normalizedCpf}`);
                }
            }
        }

        document.getElementById('dynamicForm').style.display = 'none';
        originalPkValue = null;
        await loadTable();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `21-Erro ao salvar registro: ${error.message}`;
        logMessage(21, `Erro ao salvar registro: ${error.message}`);
        updateMessages();
    }
};

document.getElementById('cancelButton').onclick = () => {
    clearMessages();
    document.getElementById('dynamicForm').style.display = 'none';
    originalPkValue = null;
    logMessage(1, 'Formulário de registro cancelado');
    updateMessages();
};

async function editInline(id) {
    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        document.getElementById('errorMessage').textContent = '5-Ação de edição requer senha ADM ou Master.';
        logMessage(5, 'Ação de edição requer senha ADM ou Master.');
        updateMessages();
        return;
    }
    clearMessages();
    try {
        const { data, error } = await supabase.from(currentTable).select('*').eq(primaryKey, id);
        if (error || !data || !data.length) {
            document.getElementById('errorMessage').textContent = `30-Erro ao buscar registro para edição: ${error?.message || 'Registro não encontrado'}`;
            logMessage(30, `Erro ao buscar registro para edição: ${error?.message || 'Registro não encontrado'}`);
            updateMessages();
            return;
        }

        const rowIndex = filteredData.findIndex(r => r[primaryKey] == id);
        if (rowIndex === -1) {
            document.getElementById('errorMessage').textContent = '30-Erro ao buscar registro para edição: Registro não encontrado na tabela local.';
            logMessage(30, 'Erro ao buscar registro para edição: Registro não encontrado na tabela local.');
            updateMessages();
            return;
        }

        const row = document.querySelector(`#dynamicTableBody tr:nth-child(${rowIndex + 1})`);
        row.innerHTML = '';
        visibleColumns.forEach(col => {
            if (SENSITIVE_COLUMNS.test(col) && !isAdminAuthenticated && !isMasterAuthenticated) return;
            const td = document.createElement('td');
            const inputType = col === 'ganho_horas' ? 'number' : 'text';
            td.innerHTML = `<input type="${inputType}" id="edit_${col}" value="${data[0][col] ?? ''}" />`;
            row.appendChild(td);
        });
        if (currentTable === 'alunos') {
            const td = document.createElement('td');
            td.textContent = data[0].ongs_registradas || '';
            row.appendChild(td);
        }
        const tdActions = document.createElement('td');
        tdActions.innerHTML = `<button onclick="confirmEdit('${id}')">Salvar</button><button onclick="loadTable()">Cancelar</button>`;
        row.appendChild(tdActions);
        originalPkValue = id;
        logMessage(1, `Edição inline iniciada para registro ${id}`);
    } catch (error) {
        document.getElementById('errorMessage').textContent = `44-Erro ao preparar edição: ${error.message}`;
        logMessage(44, `Erro ao preparar edição: ${error.message}`);
        updateMessages();
    }
}

async function confirmEdit(id) {
    clearMessages();
    const updated = {};
    let cpfValue = null;

    visibleColumns.forEach(col => {
        if (SENSITIVE_COLUMNS.test(col) && !isAdminAuthenticated && !isMasterAuthenticated) return;
        const input = document.getElementById(`edit_${col}`);
        if (input) {
            updated[col] = col === 'ganho_horas' ? parseInt(input.value, 10) || 0 : (input.value || null);
            if (col === 'CPF') {
                cpfValue = input.value;
            }
        } else {
            const row = allData.find(r => r[primaryKey] == id);
            updated[col] = row ? row[col] : null;
            if (col === 'CPF' && row) {
                cpfValue = row.CPF;
            }
        }
    });

    if (!cpfValue && TABLES_TO_CHECK.includes(currentTable)) {
        document.getElementById('errorMessage').textContent = '33-CPF não encontrado na linha editada.';
        logMessage(33, 'CPF não encontrado na linha editada.');
        updateMessages();
        return;
    }

    if (!updated[primaryKey]) {
        updated[primaryKey] = id;
    }

    const pkValue = updated[primaryKey];
    const hasDuplicate = await checkForDuplicatePk(pkValue, id);
    if (hasDuplicate) {
        document.getElementById('errorMessage').textContent = `18-O valor "${pkValue}" para a chave primária já existe na tabela.`;
        logMessage(18, `O valor "${pkValue}" para a chave primária já existe na tabela.`);
        updateMessages();
        return;
    }

    const normalizedCpf = cpfValue ? cpfValue.trim().replace(/[\.\-\s]/g, '').toLowerCase() : null;

    try {
        const { error: deleteError } = await supabase
            .from(currentTable)
            .delete()
            .eq(primaryKey, id);

        if (deleteError) throw deleteError;

        const { data: insertedData, error: insertError } = await supabase
            .from(currentTable)
            .insert([updated])
            .select();

        if (insertError) throw insertError;

        const rowIndex = filteredData.findIndex(r => r[primaryKey] == id);
        if (rowIndex !== -1) {
            filteredData[rowIndex] = { ...filteredData[rowIndex], ...updated };
            if (insertedData && insertedData.length > 0) {
                filteredData[rowIndex][primaryKey] = insertedData[0][primaryKey];
            }
        }

        if (TABLES_TO_CHECK.includes(currentTable) && normalizedCpf) {
            const { data: alunoData, error: alunoError } = await supabase
                .from('alunos')
                .select('*')
                .eq('CPF', normalizedCpf);

            if (alunoError || !alunoData || alunoData.length === 0) {
                logMessage(1, `Aluno não encontrado para CPF: ${normalizedCpf}`);
            } else {
                const totalHoras = await getTotalGanhoHorasByCpf(normalizedCpf);
                const { error: updateError } = await supabase
                    .from('alunos')
                    .update({ ganho_horas: totalHoras })
                    .eq('CPF', normalizedCpf);

                if (updateError) {
                    document.getElementById('errorMessage').textContent = `40-Erro ao atualizar ganho_horas em alunos: ${updateError.message}`;
                    logMessage(40, `Erro ao atualizar ganho_horas em alunos: ${updateError.message}`);
                    updateMessages();
                } else {
                    logMessage(1, `ganho_horas atualizado em alunos para CPF: ${normalizedCpf}`);
                }
            }
        }

        originalPkValue = null;
        await loadTable();
        document.getElementById('successMessage').textContent = '1-Edição salva com sucesso';
        logMessage(1, `Edição salva com sucesso na tabela ${currentTable}`);
        updateMessages();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `22-Erro ao salvar edição: ${error.message}`;
        logMessage(22, `Erro ao salvar edição: ${error.message}`);
        updateMessages();
    }
}

async function deleteRecord(id) {
    if (!isAdminAuthenticated && !isMasterAuthenticated) {
        document.getElementById('errorMessage').textContent = '5-Ação de exclusão requer senha ADM ou Master.';
        logMessage(5, 'Ação de exclusão requer senha ADM ou Master.');
        updateMessages();
        return;
    }
    clearMessages();
    if (!confirm(`Deseja excluir o registro ${id}?`)) {
        logMessage(1, `Exclusão do registro ${id} cancelada`);
        return;
    }
    try {
        const { data, error: fetchError } = await supabase
            .from(currentTable)
            .select('*')
            .eq(primaryKey, id);
        if (fetchError || !data || !data.length) {
            document.getElementById('errorMessage').textContent = `31-Erro ao buscar registro para exclusão: ${fetchError?.message || 'Registro não encontrado'}`;
            logMessage(31, `Erro ao buscar registro para exclusão: ${fetchError?.message || 'Registro não encontrado'}`);
            updateMessages();
            return;
        }

        const { error: deleteError } = await supabase
            .from(currentTable)
            .delete()
            .eq(primaryKey, id);

        if (deleteError) throw deleteError;

        updateSecureLog(data[0]);
        deletedRows.push({ table: currentTable, record: data[0] });
        document.getElementById('undoDeleteButton').style.display = 'inline';

        if (TABLES_TO_CHECK.includes(currentTable) && data[0].CPF) {
            const normalizedCpf = data[0].CPF.trim().replace(/[\.\-\s]/g, '').toLowerCase();
            const totalHoras = await getTotalGanhoHorasByCpf(normalizedCpf);
            const { error: updateError } = await supabase
                .from('alunos')
                .update({ ganho_horas: totalHoras })
                .eq('CPF', normalizedCpf);

            if (updateError) {
                document.getElementById('errorMessage').textContent = `40-Erro ao atualizar ganho_horas em alunos: ${updateError.message}`;
                logMessage(40, `Erro ao atualizar ganho_horas em alunos: ${updateError.message}`);
                updateMessages();
            } else {
                logMessage(1, `ganho_horas atualizado em alunos para CPF: ${normalizedCpf}`);
            }
        }

        await loadTable();
        document.getElementById('successMessage').textContent = '1-Registro excluído com sucesso';
        logMessage(1, `Registro ${id} excluído com sucesso na tabela ${currentTable}`);
        updateMessages();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `23-Erro ao excluir registro: ${error.message}`;
        logMessage(23, `Erro ao excluir registro: ${error.message}`);
        updateMessages();
    }
}

async function undoDeleteRows() {
    if (!deletedRows.length) {
        document.getElementById('errorMessage').textContent = '17-Nenhuma linha excluída para restaurar.';
        logMessage(17, 'Nenhuma linha excluída para restaurar.');
        updateMessages();
        return;
    }
    clearMessages();
    try {
        for (const { table, record } of deletedRows) {
            if (!record[primaryKey]) {
                document.getElementById('errorMessage').textContent = `42-Erro: Registro em deletedRows com chave primária inválida: ${JSON.stringify(record)}`;
                logMessage(42, `Erro: Registro em deletedRows com chave primária inválida: ${JSON.stringify(record)}`);
                updateMessages();
                continue;
            }
            if (table !== currentTable) {
                document.getElementById('errorMessage').textContent = `43-Erro: Tabela desconhecida em deletedRows: ${table}`;
                logMessage(43, `Erro: Tabela desconhecida em deletedRows: ${table}`);
                updateMessages();
                continue;
            }
            const pkValue = record[primaryKey];
            const hasDuplicate = await checkForDuplicatePk(pkValue);
            if (hasDuplicate) {
                document.getElementById('errorMessage').textContent = `18-O valor "${pkValue}" para a chave primária já existe na tabela.`;
                logMessage(18, `O valor "${pkValue}" para a chave primária já existe na tabela.`);
                updateMessages();
                continue;
            }
            const { error } = await supabase.from(table).insert([record]);
            if (error) throw error;
            logMessage(1, `Registro ${pkValue} restaurado com sucesso na tabela ${table}`);
        }
        deletedRows = [];
        secureLog = null;
        document.getElementById('undoDeleteButton').style.display = 'none';
        document.getElementById('downloadLogButton').style.display = 'none';
        await loadTable();
        document.getElementById('successMessage').textContent = '1-Restauração concluída com sucesso';
        logMessage(1, 'Restauração concluída com sucesso');
        updateMessages();
    } catch (error) {
        document.getElementById('errorMessage').textContent = `24-Erro ao restaurar linhas: ${error.message}`;
        logMessage(24, `Erro ao restaurar linhas: ${error.message}`);
        updateMessages();
    }
}

document.getElementById('loadingMessage').style.display = 'none';
updateMessages();
