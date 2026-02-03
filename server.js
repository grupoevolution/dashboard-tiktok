require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const DatabaseManager = require('./database');
const path = require('path');

const app = express();
const db = new DatabaseManager();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // limite de 100 requisições por IP
});

app.use('/api/', limiter);

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// ==================== ROTAS DE AUTENTICAÇÃO ====================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
        }

        const user = db.getUserByUsername(username);

        if (!user) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});

// Verificar token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Alterar senha
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Senhas são obrigatórias' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });
        }

        const user = db.getUserByUsername(req.user.username);
        const validPassword = await bcrypt.compare(currentPassword, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Senha atual incorreta' });
        }

        db.updatePassword(req.user.username, newPassword);

        res.json({ success: true, message: 'Senha alterada com sucesso' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
});

// ==================== ROTAS DE PERFIS ====================

// Listar todos os perfis
app.get('/api/profiles', authenticateToken, (req, res) => {
    try {
        const activeOnly = req.query.active === 'true';
        const profiles = db.getAllProfiles(activeOnly);
        res.json({ success: true, profiles });
    } catch (error) {
        console.error('Erro ao listar perfis:', error);
        res.status(500).json({ error: 'Erro ao listar perfis' });
    }
});

// Buscar perfil por ID
app.get('/api/profiles/:id', authenticateToken, (req, res) => {
    try {
        const profile = db.getProfileById(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Perfil não encontrado' });
        }
        res.json({ success: true, profile });
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
});

// Criar perfil
app.post('/api/profiles', authenticateToken, (req, res) => {
    try {
        const { name, color } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Nome do perfil é obrigatório' });
        }

        const result = db.createProfile(name.trim(), color);
        const profile = db.getProfileById(result.lastInsertRowid);

        res.json({ success: true, message: 'Perfil criado com sucesso', profile });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Já existe um perfil com este nome' });
        }
        console.error('Erro ao criar perfil:', error);
        res.status(500).json({ error: 'Erro ao criar perfil' });
    }
});

// Atualizar perfil
app.put('/api/profiles/:id', authenticateToken, (req, res) => {
    try {
        const { name, color } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Nome do perfil é obrigatório' });
        }

        const profile = db.getProfileById(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Perfil não encontrado' });
        }

        db.updateProfile(req.params.id, name.trim(), color || profile.color);
        const updatedProfile = db.getProfileById(req.params.id);

        res.json({ success: true, message: 'Perfil atualizado com sucesso', profile: updatedProfile });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Já existe um perfil com este nome' });
        }
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});

// Deletar perfil
app.delete('/api/profiles/:id', authenticateToken, (req, res) => {
    try {
        const profile = db.getProfileById(req.params.id);
        if (!profile) {
            return res.status(404).json({ error: 'Perfil não encontrado' });
        }

        db.deleteProfile(req.params.id);
        res.json({ success: true, message: 'Perfil excluído com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar perfil:', error);
        res.status(500).json({ error: 'Erro ao deletar perfil' });
    }
});

// ==================== ROTAS DE VENDAS ====================

// Listar vendas por período
app.get('/api/sales', authenticateToken, (req, res) => {
    try {
        const { startDate, endDate, profileId } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Data inicial e final são obrigatórias' });
        }

        const sales = db.getSalesByDateRange(startDate, endDate, profileId || null);
        res.json({ success: true, sales });
    } catch (error) {
        console.error('Erro ao listar vendas:', error);
        res.status(500).json({ error: 'Erro ao listar vendas' });
    }
});

// Buscar vendas de uma data específica
app.get('/api/sales/date/:date', authenticateToken, (req, res) => {
    try {
        const sales = db.getSalesByDate(req.params.date);
        res.json({ success: true, sales });
    } catch (error) {
        console.error('Erro ao buscar vendas:', error);
        res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
});

// Criar ou atualizar venda
app.post('/api/sales', authenticateToken, (req, res) => {
    try {
        const { date, sales, notes } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Data é obrigatória' });
        }

        if (!sales || !Array.isArray(sales)) {
            return res.status(400).json({ error: 'Vendas devem ser um array' });
        }

        // Salvar cada venda
        sales.forEach(sale => {
            const amount = parseFloat(sale.amount) || 0;
            db.createOrUpdateSale(date, sale.profileId, amount, notes || null);
        });

        res.json({ success: true, message: 'Vendas salvas com sucesso' });
    } catch (error) {
        console.error('Erro ao salvar vendas:', error);
        res.status(500).json({ error: 'Erro ao salvar vendas' });
    }
});

// Deletar venda
app.delete('/api/sales/:id', authenticateToken, (req, res) => {
    try {
        db.deleteSale(req.params.id);
        res.json({ success: true, message: 'Venda excluída com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar venda:', error);
        res.status(500).json({ error: 'Erro ao deletar venda' });
    }
});

// ==================== ROTAS DE ESTATÍSTICAS ====================

// Dashboard - estatísticas gerais
app.get('/api/stats/dashboard', authenticateToken, (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Total de vendas
        const totalSales = db.getTotalSales(startDate, endDate);

        // Vendas por perfil
        const salesByProfile = db.getSalesByProfile(startDate, endDate);

        // Meta mensal
        const monthlyMeta = parseFloat(db.getSetting('monthly_meta')) || 15000;

        // Calcular vendas do mês atual
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const currentMonthSales = db.getTotalSales(currentMonthStart, currentMonthEnd);

        // Calcular vendas do mês anterior
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        const lastMonthSales = db.getTotalSales(lastMonthStart, lastMonthEnd);

        res.json({
            success: true,
            stats: {
                totalSales,
                salesByProfile,
                monthlyMeta,
                currentMonthSales,
                lastMonthSales,
                metaProgress: (currentMonthSales / monthlyMeta) * 100
            }
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

// ==================== ROTAS DE CONFIGURAÇÕES ====================

// Buscar meta mensal
app.get('/api/settings/meta', authenticateToken, (req, res) => {
    try {
        const meta = parseFloat(db.getSetting('monthly_meta')) || 15000;
        res.json({ success: true, meta });
    } catch (error) {
        console.error('Erro ao buscar meta:', error);
        res.status(500).json({ error: 'Erro ao buscar meta' });
    }
});

// Atualizar meta mensal
app.post('/api/settings/meta', authenticateToken, (req, res) => {
    try {
        const { meta } = req.body;

        if (!meta || meta <= 0) {
            return res.status(400).json({ error: 'Meta inválida' });
        }

        db.setSetting('monthly_meta', meta.toString());
        res.json({ success: true, message: 'Meta atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar meta:', error);
        res.status(500).json({ error: 'Erro ao atualizar meta' });
    }
});

// ==================== ROTAS DE EXPORTAÇÃO ====================

// Exportar dados em CSV
app.get('/api/export/csv', authenticateToken, (req, res) => {
    try {
        const { startDate, endDate, profileId } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Data inicial e final são obrigatórias' });
        }

        const sales = db.getSalesByDateRange(startDate, endDate, profileId || null);

        // Criar CSV
        let csv = 'Data,Perfil,Valor,Observações\n';
        
        sales.forEach(sale => {
            const date = sale.date;
            const profile = sale.profile_name;
            const amount = sale.amount.toFixed(2);
            const notes = (sale.notes || '').replace(/"/g, '""'); // Escapar aspas
            
            csv += `"${date}","${profile}","${amount}","${notes}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=vendas_${startDate}_${endDate}.csv`);
        res.send('\ufeff' + csv); // BOM para Excel reconhecer UTF-8
    } catch (error) {
        console.error('Erro ao exportar CSV:', error);
        res.status(500).json({ error: 'Erro ao exportar dados' });
    }
});

// ==================== ROTAS DE BACKUP ====================

// Criar backup manual
app.post('/api/backup', authenticateToken, (req, res) => {
    try {
        db.createBackup();
        res.json({ success: true, message: 'Backup criado com sucesso' });
    } catch (error) {
        console.error('Erro ao criar backup:', error);
        res.status(500).json({ error: 'Erro ao criar backup' });
    }
});

// ==================== ROTAS ESTÁTICAS ====================

// Página de login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Redirecionar raiz para dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== INICIAR SERVIDOR ====================

app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════╗
    ║   🚀 TikTok Shop Dashboard API               ║
    ║   📍 Servidor rodando na porta ${PORT}         ║
    ║   🌐 http://localhost:${PORT}                  ║
    ╚══════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando servidor...');
    db.close();
    process.exit(0);
});
