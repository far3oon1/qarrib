const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const { initializeSocket } = require('./sockets');
initializeSocket(server);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Static files (frontend)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Qarrib API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/nurses', require('./routes/nurses'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));

// Seed admin user on first run
const User = require('./models/User');

function seedAdmin() {
    try {
        const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@qarrib.com';
        const existingAdmin = User.findByEmail(adminEmail);

        if (!existingAdmin) {
            console.log('🔄 Creating admin user...');

            const admin = User.create({
                name: 'System Admin',
                email: adminEmail,
                phone: process.env.ADMIN_PHONE || '01000000000',
                password: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123',
                nationalId: '00000000000000',
                role: 'admin'
            });

            User.update({id: admin.id}, {
                isVerified: true,
                verificationStatus: 'approved',
                isActive: true
            });

            console.log('✅ Admin user created successfully');
            console.log(`   Email: ${adminEmail}`);
            console.log(`   Password: ${process.env.ADMIN_DEFAULT_PASSWORD || 'admin123'}`);
            console.log('   ⚠️  Change default password in production!');
        } else {
            console.log('ℹ️  Admin user already exists:', existingAdmin.email);
            if (!existingAdmin.isActive) {
                User.update({id: existingAdmin.id}, { isActive: true });
                console.log('✅ Admin reactivated');
            }
        }
    } catch (error) {
        console.error('❌ Error seeding admin:', error.message);
    }
}

// Initialize
seedAdmin();

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║         Qarrib API Server Running          ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  Port:        ${PORT.toString().padEnd(33)}║`);
    console.log(`║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(33)}║`);
    console.log(`║  API URL:     http://localhost:${PORT}/api${' '.repeat(23 - PORT.toString().length)}║`);
    console.log('╚════════════════════════════════════════════╝');
});

module.exports = { app, server };
