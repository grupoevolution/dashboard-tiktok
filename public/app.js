// Configuração da API
const API_URL = window.location.origin;
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
let profiles = [];
let monthlyMeta = 15000;
let lineChart, pieChart;

// Verificar autenticação ao carregar
document.addEventListener('DOMContentLoaded', async function() {
    if (!token) {
        window.location.href = '/login';
        return;
    }

    try {
        await verifyToken();
        await init();
    } catch (error) {
        console.error('Erro ao inicializar:', error);
        window.location.href = '/login';
    }
});

// Verificar token
async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Token inválido');
        }

        return await response.json();
    } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        throw error;
    }
}

// Inicializar aplicação
async function init() {
    setTodayDate();
    await loadProfiles();
    await loadMeta();
    updateDashboard();
    loadSalesHistory();
}

// Fazer requisição autenticada
async function fetchAPI(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Erro na requisição');
    }

    return data;
}

// ==================== AUTENTICAÇÃO ====================

function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }
}

async function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showAlert('settings', 'error', 'As senhas não coincidem');
        return;
    }

    if (newPassword.length < 6) {
        showAlert('settings', 'error', 'A senha deve ter no mínimo 6 caracteres');
        return;
    }

    try {
        await fetchAPI(`${API_URL}/api/auth/change-password`, {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });

        showAlert('settings', 'success', 'Senha alterada com sucesso!');
        document.getElementById('passwordForm').reset();
    } catch (error) {
        showAlert('settings', 'error', error.message);
    }
}

// ==================== TABS ====================

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    event.target.closest('.tab').classList.add('active');
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'add-sales') {
        loadProfilesInputs();
        loadSalesHistory();
    } else if (tabName === 'manage-profiles') {
        loadProfilesList();
    } else if (tabName === 'settings') {
        document.getElementById('settingsMetaValue').value = monthlyMeta;
    }
}

// ==================== PERFIS ====================

async function loadProfiles() {
    try {
        const data = await fetchAPI(`${API_URL}/api/profiles?active=true`);
        profiles = data.profiles;
        
        // Atualizar select de filtro
        const filterSelect = document.getElementById('filterProfile');
        filterSelect.innerHTML = '<option value="all">Todos os Perfis</option>';
        profiles.forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name;
            filterSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar perfis:', error);
        showAlert('dashboard', 'error', 'Erro ao carregar perfis');
    }
}

function loadProfilesInputs() {
    const container = document.getElementById('profilesInputs');
    container.innerHTML = '';

    if (profiles.length === 0) {
        container.innerHTML = '<p style="color: #888;">Nenhum perfil cadastrado. Vá até "Gerenciar Perfis" para adicionar.</p>';
        return;
    }

    profiles.forEach(profile => {
        const div = document.createElement('div');
        div.className = 'form-group';
        div.innerHTML = `
            <label><i class="fas fa-dollar-sign"></i> ${profile.name}</label>
            <input 
                type="number" 
                step="0.01" 
                min="0" 
                id="profile_${profile.id}" 
                placeholder="R$ 0,00"
                data-profile-id="${profile.id}"
            >
        `;
        container.appendChild(div);
    });
}

async function saveProfile(event) {
    event.preventDefault();

    const name = document.getElementById('profileName').value.trim();

    if (!name) {
        showAlert('profiles', 'error', 'Nome do perfil é obrigatório');
        return;
    }

    try {
        await fetchAPI(`${API_URL}/api/profiles`, {
            method: 'POST',
            body: JSON.stringify({ name })
        });

        showAlert('profiles', 'success', 'Perfil adicionado com sucesso!');
        document.getElementById('profileForm').reset();
        await loadProfiles();
        loadProfilesList();
    } catch (error) {
        showAlert('profiles', 'error', error.message);
    }
}

async function loadProfilesList() {
    try {
        const data = await fetchAPI(`${API_URL}/api/profiles`);
        const container = document.getElementById('profilesList');

        if (data.profiles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>Nenhum perfil cadastrado</h3>
                    <p>Adicione seu primeiro perfil acima</p>
                </div>
            `;
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Cor</th>
                        <th>Nome do Perfil</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.profiles.forEach(profile => {
            html += `
                <tr>
                    <td><span class="color-indicator" style="background-color: ${profile.color}"></span></td>
                    <td><strong>${profile.name}</strong></td>
                    <td>${profile.active ? '<span style="color: #25F4EE;">Ativo</span>' : '<span style="color: #888;">Inativo</span>'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-small btn-edit" onclick="openEditProfileModal(${profile.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${profile.active ? `
                                <button class="btn btn-small btn-delete" onclick="deleteProfile(${profile.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (error) {
        console.error('Erro ao carregar lista de perfis:', error);
        showAlert('profiles', 'error', 'Erro ao carregar perfis');
    }
}

function openEditProfileModal(profileId) {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    document.getElementById('editProfileId').value = profile.id;
    document.getElementById('editProfileName').value = profile.name;
    document.getElementById('editProfileModal').classList.add('active');
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').classList.remove('active');
}

async function updateProfile(event) {
    event.preventDefault();

    const id = document.getElementById('editProfileId').value;
    const name = document.getElementById('editProfileName').value.trim();

    if (!name) {
        showAlert('profiles', 'error', 'Nome do perfil é obrigatório');
        return;
    }

    try {
        await fetchAPI(`${API_URL}/api/profiles/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name })
        });

        showAlert('profiles', 'success', 'Perfil atualizado com sucesso!');
        closeEditProfileModal();
        await loadProfiles();
        loadProfilesList();
    } catch (error) {
        showAlert('profiles', 'error', error.message);
    }
}

async function deleteProfile(profileId) {
    const profile = profiles.find(p => p.id === profileId);
    if (!confirm(`Tem certeza que deseja excluir o perfil "${profile.name}"?`)) {
        return;
    }

    try {
        await fetchAPI(`${API_URL}/api/profiles/${profileId}`, {
            method: 'DELETE'
        });

        showAlert('profiles', 'success', 'Perfil excluído com sucesso!');
        await loadProfiles();
        loadProfilesList();
    } catch (error) {
        showAlert('profiles', 'error', error.message);
    }
}

// ==================== VENDAS ====================

async function saveSales(event) {
    event.preventDefault();

    const date = document.getElementById('salesDate').value;
    const notes = document.getElementById('salesNotes').value.trim();
    const sales = [];

    // Coletar valores dos perfis
    profiles.forEach(profile => {
        const input = document.getElementById(`profile_${profile.id}`);
        const amount = parseFloat(input.value) || 0;
        sales.push({
            profileId: profile.id,
            amount: amount
        });
    });

    try {
        await fetchAPI(`${API_URL}/api/sales`, {
            method: 'POST',
            body: JSON.stringify({ date, sales, notes })
        });

        showAlert('sales', 'success', 'Vendas salvas com sucesso!');
        resetSalesForm();
        loadSalesHistory();
    } catch (error) {
        showAlert('sales', 'error', error.message);
    }
}

function resetSalesForm() {
    document.getElementById('salesForm').reset();
    setTodayDate();
}

async function loadSalesHistory() {
    try {
        // Buscar vendas dos últimos 30 dias
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const data = await fetchAPI(`${API_URL}/api/sales?startDate=${startDate}&endDate=${endDate}`);
        const container = document.getElementById('salesHistory');

        if (data.sales.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>Nenhuma venda registrada</h3>
                    <p>Adicione sua primeira venda acima</p>
                </div>
            `;
            return;
        }

        // Agrupar vendas por data
        const salesByDate = {};
        data.sales.forEach(sale => {
            if (!salesByDate[sale.date]) {
                salesByDate[sale.date] = {
                    date: sale.date,
                    notes: sale.notes,
                    sales: [],
                    total: 0
                };
            }
            salesByDate[sale.date].sales.push(sale);
            salesByDate[sale.date].total += sale.amount;
        });

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Perfil</th>
                        <th>Valor</th>
                        <th>Total do Dia</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.values(salesByDate).reverse().forEach(dayData => {
            dayData.sales.forEach((sale, index) => {
                html += `
                    <tr>
                        ${index === 0 ? `<td rowspan="${dayData.sales.length}"><strong>${formatDate(dayData.date)}</strong></td>` : ''}
                        <td><span class="color-indicator" style="background-color: ${sale.profile_color}"></span> ${sale.profile_name}</td>
                        <td>${formatCurrency(sale.amount)}</td>
                        ${index === 0 ? `
                            <td rowspan="${dayData.sales.length}"><strong>${formatCurrency(dayData.total)}</strong></td>
                            <td rowspan="${dayData.sales.length}">${dayData.notes || '-'}</td>
                        ` : ''}
                    </tr>
                `;
            });
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
    }
}

// ==================== META ====================

async function loadMeta() {
    try {
        const data = await fetchAPI(`${API_URL}/api/settings/meta`);
        monthlyMeta = data.meta;
    } catch (error) {
        console.error('Erro ao carregar meta:', error);
    }
}

function openMetaModal() {
    document.getElementById('metaValue').value = monthlyMeta;
    document.getElementById('metaModal').classList.add('active');
}

function closeMetaModal() {
    document.getElementById('metaModal').classList.remove('active');
}

async function updateMeta(event) {
    event.preventDefault();

    const meta = parseFloat(document.getElementById('metaValue').value);

    if (!meta || meta <= 0) {
        showAlert('dashboard', 'error', 'Meta inválida');
        return;
    }

    try {
        await fetchAPI(`${API_URL}/api/settings/meta`, {
            method: 'POST',
            body: JSON.stringify({ meta })
        });

        monthlyMeta = meta;
        showAlert('dashboard', 'success', 'Meta atualizada com sucesso!');
        closeMetaModal();
        updateDashboard();
    } catch (error) {
        showAlert('dashboard', 'error', error.message);
    }
}

async function updateMetaFromSettings(event) {
    event.preventDefault();

    const meta = parseFloat(document.getElementById('settingsMetaValue').value);

    if (!meta || meta <= 0) {
        showAlert('settings', 'error', 'Meta inválida');
        return;
    }

    try {
        await fetchAPI(`${API_URL}/api/settings/meta`, {
            method: 'POST',
            body: JSON.stringify({ meta })
        });

        monthlyMeta = meta;
        showAlert('settings', 'success', 'Meta atualizada com sucesso!');
    } catch (error) {
        showAlert('settings', 'error', error.message);
    }
}

// ==================== DASHBOARD ====================

async function updateDashboard() {
    try {
        const { startDate, endDate } = getFilterDates();
        
        // Buscar estatísticas
        const statsData = await fetchAPI(`${API_URL}/api/stats/dashboard?startDate=${startDate}&endDate=${endDate}`);
        
        // Buscar vendas do período filtrado
        const salesData = await fetchAPI(`${API_URL}/api/sales?startDate=${startDate}&endDate=${endDate}`);

        renderFixedCards(statsData.stats);
        updateMetaProgress(statsData.stats);
        renderRanking(statsData.stats.salesByProfile);
        updateCharts(salesData.sales, statsData.stats.salesByProfile);
        renderStatsCards(salesData.sales, statsData.stats);
    } catch (error) {
        console.error('Erro ao atualizar dashboard:', error);
        showAlert('dashboard', 'error', 'Erro ao carregar dados do dashboard');
    }
}

function renderFixedCards(stats) {
    const container = document.getElementById('fixedCards');

    const comparisonPercentage = stats.lastMonthSales > 0 
        ? ((stats.currentMonthSales - stats.lastMonthSales) / stats.lastMonthSales * 100).toFixed(1)
        : 0;

    const comparisonIcon = comparisonPercentage >= 0 ? '↑' : '↓';
    const comparisonColor = comparisonPercentage >= 0 ? '#25F4EE' : '#ff4444';

    const html = `
        <div class="fixed-card">
            <div class="fixed-card-content">
                <div class="fixed-card-icon"><i class="fas fa-dollar-sign"></i></div>
                <div class="fixed-card-label">Faturamento Total</div>
                <div class="fixed-card-value">${formatCurrency(stats.totalSales)}</div>
            </div>
        </div>
        <div class="fixed-card">
            <div class="fixed-card-content">
                <div class="fixed-card-icon"><i class="fas fa-calendar-alt"></i></div>
                <div class="fixed-card-label">Mês Atual</div>
                <div class="fixed-card-value">${formatCurrency(stats.currentMonthSales)}</div>
                <div class="fixed-card-subvalue">
                    <span style="color: ${comparisonColor}">
                        ${comparisonIcon} ${Math.abs(comparisonPercentage)}% vs mês anterior
                    </span>
                </div>
            </div>
        </div>
        <div class="fixed-card">
            <div class="fixed-card-content">
                <div class="fixed-card-icon"><i class="fas fa-bullseye"></i></div>
                <div class="fixed-card-label">Progresso da Meta</div>
                <div class="fixed-card-value">${stats.metaProgress.toFixed(1)}%</div>
                <div class="fixed-card-subvalue">Faltam ${formatCurrency(Math.max(0, stats.monthlyMeta - stats.currentMonthSales))}</div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function renderStatsCards(sales, stats) {
    const container = document.getElementById('statsCards');

    if (sales.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <i class="fas fa-chart-line"></i>
                <h3>Nenhum dado encontrado</h3>
                <p>Ajuste os filtros ou adicione vendas</p>
            </div>
        `;
        return;
    }

    // Calcular estatísticas do período filtrado
    let totalFiltered = 0;
    const salesByDate = {};

    sales.forEach(sale => {
        totalFiltered += sale.amount;
        if (!salesByDate[sale.date]) {
            salesByDate[sale.date] = 0;
        }
        salesByDate[sale.date] += sale.amount;
    });

    const daysCount = Object.keys(salesByDate).length;
    const avgDaily = daysCount > 0 ? totalFiltered / daysCount : 0;

    // Melhor dia
    let bestDay = { date: '', value: 0 };
    Object.entries(salesByDate).forEach(([date, total]) => {
        if (total > bestDay.value) {
            bestDay = { date, value: total };
        }
    });

    // Melhor perfil
    const profileId = document.getElementById('filterProfile').value;
    const bestProfile = profileId === 'all' && stats.salesByProfile.length > 0 
        ? stats.salesByProfile[0] 
        : null;

    let html = `
        <div class="card">
            <div class="card-icon"><i class="fas fa-filter"></i></div>
            <div class="card-label">Total Filtrado</div>
            <div class="card-value">${formatCurrency(totalFiltered)}</div>
        </div>
        <div class="card">
            <div class="card-icon"><i class="fas fa-chart-line"></i></div>
            <div class="card-label">Média Diária</div>
            <div class="card-value">${formatCurrency(avgDaily)}</div>
        </div>
        <div class="card">
            <div class="card-icon"><i class="fas fa-calendar-star"></i></div>
            <div class="card-label">Melhor Dia</div>
            <div class="card-value">${formatCurrency(bestDay.value)}</div>
            <div class="card-subvalue">${formatDate(bestDay.date)}</div>
        </div>
    `;

    if (bestProfile) {
        html += `
            <div class="card">
                <div class="card-icon"><i class="fas fa-trophy"></i></div>
                <div class="card-label">Melhor Perfil</div>
                <div class="card-value">${formatCurrency(bestProfile.total)}</div>
                <div class="card-subvalue">${bestProfile.name}</div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function updateMetaProgress(stats) {
    const percentage = Math.min(stats.metaProgress, 100);

    document.getElementById('metaProgress').style.width = percentage + '%';
    document.getElementById('metaProgress').textContent = percentage.toFixed(1) + '%';
    document.getElementById('metaCurrent').textContent = formatCurrency(stats.currentMonthSales);
    document.getElementById('metaTarget').textContent = 'Meta: ' + formatCurrency(stats.monthlyMeta);
}

function renderRanking(salesByProfile) {
    const container = document.getElementById('rankingContainer');
    const profileId = document.getElementById('filterProfile').value;

    if (profileId !== 'all') {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <i class="fas fa-filter"></i>
                <h3>Ranking disponível apenas com "Todos os Perfis"</h3>
            </div>
        `;
        return;
    }

    if (salesByProfile.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <i class="fas fa-inbox"></i>
                <h3>Sem dados para exibir</h3>
            </div>
        `;
        return;
    }

    let html = '';
    salesByProfile.forEach((profile, index) => {
        html += `
            <div class="ranking-item">
                <div class="ranking-position">${index + 1}º</div>
                <div class="ranking-account">
                    <span class="color-indicator" style="background-color: ${profile.color}"></span>
                    ${profile.name}
                </div>
                <div class="ranking-value">${formatCurrency(profile.total)}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function updateCharts(sales, salesByProfile) {
    // Destruir gráficos existentes
    if (lineChart) lineChart.destroy();
    if (pieChart) pieChart.destroy();

    if (sales.length === 0) {
        document.getElementById('lineChart').parentElement.innerHTML = '<p style="text-align: center; color: #888;">Sem dados</p>';
        document.getElementById('pieChart').parentElement.innerHTML = '<p style="text-align: center; color: #888;">Sem dados</p>';
        return;
    }

    // Preparar dados para gráfico de linha
    const salesByDate = {};
    sales.forEach(sale => {
        if (!salesByDate[sale.date]) {
            salesByDate[sale.date] = 0;
        }
        salesByDate[sale.date] += sale.amount;
    });

    const lineLabels = Object.keys(salesByDate).sort();
    const lineData = lineLabels.map(date => salesByDate[date]);

    // Gráfico de linha
    const lineCtx = document.getElementById('lineChart').getContext('2d');
    lineChart = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: lineLabels.map(date => formatDate(date)),
            datasets: [{
                label: 'Faturamento',
                data: lineData,
                borderColor: '#FE2C55',
                backgroundColor: 'rgba(254, 44, 85, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'R$ ' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#888',
                        callback: function(value) {
                            return 'R$ ' + value.toFixed(0);
                        }
                    },
                    grid: { color: '#2a2a2a' }
                },
                x: {
                    ticks: { color: '#888' },
                    grid: { color: '#2a2a2a' }
                }
            }
        }
    });

    // Gráfico de pizza
    const profileId = document.getElementById('filterProfile').value;
    if (profileId === 'all' && salesByProfile.length > 0) {
        const pieCtx = document.getElementById('pieChart').getContext('2d');
        pieChart = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: salesByProfile.map(p => p.name),
                datasets: [{
                    data: salesByProfile.map(p => p.total),
                    backgroundColor: salesByProfile.map(p => p.color)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#888',
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': R$ ' + context.parsed.toFixed(2) + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    } else {
        document.getElementById('pieChart').parentElement.innerHTML = `
            <div class="empty-state" style="padding: 60px 20px;">
                <i class="fas fa-filter"></i>
                <h3>Gráfico disponível apenas com "Todos os Perfis"</h3>
            </div>
        `;
    }
}

// ==================== FILTROS ====================

function getFilterDates() {
    const period = document.getElementById('filterPeriod').value;
    const now = new Date();
    let startDate, endDate;

    switch (period) {
        case 'daily':
            startDate = endDate = now.toISOString().split('T')[0];
            break;
        case 'weekly':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            startDate = weekAgo.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
            break;
        case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            break;
        case 'custom':
            startDate = document.getElementById('customStartDate').value;
            endDate = document.getElementById('customEndDate').value;
            break;
    }

    return { startDate, endDate };
}

function toggleCustomDates() {
    const period = document.getElementById('filterPeriod').value;
    const showCustom = period === 'custom';
    document.getElementById('customStartGroup').style.display = showCustom ? 'block' : 'none';
    document.getElementById('customEndGroup').style.display = showCustom ? 'block' : 'none';
    
    if (!showCustom) {
        applyFilters();
    }
}

function applyFilters() {
    updateDashboard();
}

// ==================== EXPORTAÇÃO ====================

async function exportCSV() {
    try {
        const { startDate, endDate } = getFilterDates();
        const profileId = document.getElementById('filterProfile').value;
        
        let url = `${API_URL}/api/export/csv?startDate=${startDate}&endDate=${endDate}`;
        if (profileId !== 'all') {
            url += `&profileId=${profileId}`;
        }

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao exportar dados');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `vendas_${startDate}_${endDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);

        showAlert('dashboard', 'success', 'Dados exportados com sucesso!');
    } catch (error) {
        showAlert('dashboard', 'error', 'Erro ao exportar dados');
    }
}

// ==================== BACKUP ====================

async function createBackup() {
    try {
        await fetchAPI(`${API_URL}/api/backup`, {
            method: 'POST'
        });

        showAlert('settings', 'success', 'Backup criado com sucesso!');
    } catch (error) {
        showAlert('settings', 'error', 'Erro ao criar backup');
    }
}

// ==================== UTILITÁRIOS ====================

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('salesDate').value = today;
    document.getElementById('customEndDate').value = today;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

function showAlert(tab, type, message) {
    const alertId = `alert${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
    const alert = document.getElementById(alertId);
    
    if (!alert) return;

    alert.className = `alert alert-${type} show`;
    alert.textContent = message;

    setTimeout(() => {
        alert.classList.remove('show');
    }, 4000);
}
