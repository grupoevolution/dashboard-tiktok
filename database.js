const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
    constructor() {
        // Criar diretório de dados se não existir
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('📁 Diretório de dados criado');
        }

        // Banco dentro da pasta data
        const dbPath = path.join(dataDir, 'tiktok_shop.db');
        console.log(`📍 Caminho do banco: ${dbPath}`);

        this.db = new Database(dbPath);
        console.log(`✅ Banco de dados conectado`);
        
        this.initDatabase();
        this.setupBackup();
    }

    initDatabase() {
        // Tabela de usuário
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de perfis do TikTok
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                color TEXT,
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de vendas diárias
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS daily_sales (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                profile_id INTEGER NOT NULL,
                amount DECIMAL(10,2) DEFAULT 0.00,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id),
                UNIQUE(date, profile_id)
            )
        `);

        // Tabela de configurações
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inicializar dados padrão
        this.initDefaultData();
    }

    initDefaultData() {
        // Verificar se já existe usuário
        const userExists = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
        
        if (userExists.count === 0) {
            const username = process.env.DEFAULT_USERNAME || 'admin';
            const password = process.env.DEFAULT_PASSWORD || 'admin123';
            const hashedPassword = bcrypt.hashSync(password, 10);
            
            this.db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
            console.log(`✅ Usuário padrão criado: ${username}`);
        }

        // Verificar se já existem perfis
        const profilesExist = this.db.prepare('SELECT COUNT(*) as count FROM profiles').get();
        
        if (profilesExist.count === 0) {
            const defaultProfiles = [
                { name: '@judourado.shop', color: '#FE2C55' },
                { name: '@mariadourado.shop', color: '#25F4EE' }
            ];

            const insertProfile = this.db.prepare('INSERT INTO profiles (name, color) VALUES (?, ?)');
            
            for (const profile of defaultProfiles) {
                insertProfile.run(profile.name, profile.color);
            }
            
            console.log('✅ Perfis padrão criados');
        }

        // Configuração padrão de meta
        const metaExists = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('monthly_meta');
        
        if (!metaExists) {
            this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('monthly_meta', '15000');
            console.log('✅ Meta mensal padrão configurada: R$ 15.000,00');
        }
    }

    setupBackup() {
        // Criar pasta de backups se não existir
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            console.log('📁 Diretório de backups criado');
        }

        // Backup diário às 3h da manhã
        const scheduleBackup = () => {
            const now = new Date();
            const nextBackup = new Date();
            nextBackup.setHours(3, 0, 0, 0);
            
            if (now > nextBackup) {
                nextBackup.setDate(nextBackup.getDate() + 1);
            }
            
            const timeUntilBackup = nextBackup - now;
            
            setTimeout(() => {
                this.createBackup();
                scheduleBackup();
            }, timeUntilBackup);
        };

        scheduleBackup();
    }

    createBackup() {
        try {
            const backupDir = path.join(__dirname, 'backups');
            const timestamp = new Date().toISOString().split('T')[0];
            const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
            
            this.db.backup(backupPath);
            
            console.log(`✅ Backup criado: ${backupPath}`);
            
            this.cleanOldBackups(backupDir);
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
        }
    }

    cleanOldBackups(backupDir) {
        try {
            const files = fs.readdirSync(backupDir)
                .filter(file => file.startsWith('backup_') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(backupDir, file),
                    time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            if (files.length > 30) {
                files.slice(30).forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️ Backup antigo removido: ${file.name}`);
                });
            }
        } catch (error) {
            console.error('❌ Erro ao limpar backups antigos:', error);
        }
    }

    // Métodos de usuário
    getUserByUsername(username) {
        return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    }

    updatePassword(username, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        return this.db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, username);
    }

    // Métodos de perfis
    getAllProfiles(activeOnly = false) {
        if (activeOnly) {
            return this.db.prepare('SELECT * FROM profiles WHERE active = 1 ORDER BY name').all();
        }
        return this.db.prepare('SELECT * FROM profiles ORDER BY name').all();
    }

    getProfileById(id) {
        return this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    }

    createProfile(name, color = null) {
        if (!color) {
            color = '#' + Math.floor(Math.random()*16777215).toString(16);
        }
        return this.db.prepare('INSERT INTO profiles (name, color) VALUES (?, ?)').run(name, color);
    }

    updateProfile(id, name, color) {
        return this.db.prepare('UPDATE profiles SET name = ?, color = ? WHERE id = ?').run(name, color, id);
    }

    deleteProfile(id) {
        return this.db.prepare('UPDATE profiles SET active = 0 WHERE id = ?').run(id);
    }

    // Métodos de vendas
    getSalesByDateRange(startDate, endDate, profileId = null) {
        let query = `
            SELECT ds.*, p.name as profile_name, p.color as profile_color
            FROM daily_sales ds
            JOIN profiles p ON ds.profile_id = p.id
            WHERE ds.date BETWEEN ? AND ?
        `;
        
        const params = [startDate, endDate];
        
        if (profileId) {
            query += ' AND ds.profile_id = ?';
            params.push(profileId);
        }
        
        query += ' ORDER BY ds.date, p.name';
        
        return this.db.prepare(query).all(...params);
    }

    getSaleByDateAndProfile(date, profileId) {
        return this.db.prepare('SELECT * FROM daily_sales WHERE date = ? AND profile_id = ?').get(date, profileId);
    }

    createOrUpdateSale(date, profileId, amount, notes = null) {
        const existing = this.getSaleByDateAndProfile(date, profileId);
        
        if (existing) {
            return this.db.prepare(`
                UPDATE daily_sales 
                SET amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE date = ? AND profile_id = ?
            `).run(amount, notes, date, profileId);
        } else {
            return this.db.prepare(`
                INSERT INTO daily_sales (date, profile_id, amount, notes) 
                VALUES (?, ?, ?, ?)
            `).run(date, profileId, amount, notes);
        }
    }

    deleteSale(id) {
        return this.db.prepare('DELETE FROM daily_sales WHERE id = ?').run(id);
    }

    getSalesByDate(date) {
        return this.db.prepare(`
            SELECT ds.*, p.name as profile_name, p.color as profile_color
            FROM daily_sales ds
            JOIN profiles p ON ds.profile_id = p.id
            WHERE ds.date = ?
            ORDER BY p.name
        `).all(date);
    }

    // Métodos de configurações
    getSetting(key) {
        const result = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return result ? result.value : null;
    }

    setSetting(key, value) {
        return this.db.prepare(`
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `).run(key, value, value);
    }

    // Estatísticas
    getTotalSales(startDate = null, endDate = null) {
        let query = 'SELECT SUM(amount) as total FROM daily_sales WHERE 1=1';
        const params = [];
        
        if (startDate && endDate) {
            query += ' AND date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        
        const result = this.db.prepare(query).get(...params);
        return result.total || 0;
    }

    getSalesByProfile(startDate = null, endDate = null) {
        let query = `
            SELECT p.id, p.name, p.color, COALESCE(SUM(ds.amount), 0) as total
            FROM profiles p
            LEFT JOIN daily_sales ds ON p.id = ds.profile_id
            WHERE p.active = 1
        `;
        
        const params = [];
        
        if (startDate && endDate) {
            query += ' AND ds.date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }
        
        query += ' GROUP BY p.id, p.name, p.color ORDER BY total DESC';
        
        return this.db.prepare(query).all(...params);
    }

    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
