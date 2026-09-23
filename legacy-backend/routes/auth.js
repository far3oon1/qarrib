const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Document = require('../models/Document');
const { generateToken } = require('../config/auth');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Register - Patient
router.post('/register/patient', async (req, res) => {
    try {
        const { name, email, phone, password, nationalId, address } = req.body;

        // Validation
        if (!name || !email || !phone || !password || !nationalId) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required: name, email, phone, password, nationalId'
            });
        }

        // Check if user exists
        if (User.findByEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        if (User.findByPhone(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Validate Egyptian phone number
        const phoneRegex = /^01[0-2,5]{1}[0-9]{8}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Egyptian phone number format'
            });
        }

        // Validate National ID (14 digits)
        if (!/^\d{14}$/.test(nationalId)) {
            return res.status(400).json({
                success: false,
                message: 'National ID must be 14 digits'
            });
        }

        const user = await User.create({
            name,
            email,
            phone,
            password,
            nationalId,
            address,
            role: 'patient'
        });

        const token = generateToken(user);

        res.status(201).json({
            success: true,
            message: 'Patient registered successfully',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    walletBalance: user.walletBalance
                },
                token
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Register - Nurse
router.post('/register/nurse', async (req, res) => {
    try {
        const { 
            name, email, phone, password, nationalId, address,
            licenseNumber, specialization, yearsOfExperience 
        } = req.body;

        if (!name || !email || !phone || !password || !nationalId || !licenseNumber) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (User.findByEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        if (User.findByPhone(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        const user = await User.create({
            name,
            email,
            phone,
            password,
            nationalId,
            address,
            licenseNumber,
            specialization,
            yearsOfExperience: parseInt(yearsOfExperience) || 0,
            role: 'nurse'
        });

        const token = generateToken(user);

        res.status(201).json({
            success: true,
            message: 'Nurse registered successfully. Please upload your documents for verification.',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    isVerified: user.isVerified,
                    verificationStatus: user.verificationStatus
                },
                token
            }
        });
    } catch (error) {
        console.error('Nurse registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Upload Documents (ID Card + License)
router.post('/upload-documents', authenticate, upload.fields([
    { name: 'idCard', maxCount: 1 },
    { name: 'license', maxCount: 1 }
]), async (req, res) => {
    try {
        const userId = req.user.id;
        const user = User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const uploadedDocs = [];

        if (req.files.idCard) {
            const idCard = req.files.idCard[0];
            const doc = Document.create({
                userId,
                userRole: user.role,
                type: 'national_id',
                fileName: idCard.filename,
                filePath: idCard.path,
                fileUrl: `/uploads/documents/${idCard.filename}`,
                documentNumber: user.nationalId
            });
            uploadedDocs.push(doc);

            User.update(userId, { idCardImage: doc.fileUrl });
        }

        if (req.files.license && user.role === 'nurse') {
            const license = req.files.license[0];
            const doc = Document.create({
                userId,
                userRole: user.role,
                type: 'nursing_license',
                fileName: license.filename,
                filePath: license.path,
                fileUrl: `/uploads/documents/${license.filename}`,
                documentNumber: user.licenseNumber
            });
            uploadedDocs.push(doc);

            User.update(userId, { licenseImage: doc.fileUrl });
        }

        res.json({
            success: true,
            message: 'Documents uploaded successfully',
            data: uploadedDocs
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Upload failed',
            error: error.message
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('=== LOGIN ATTEMPT ===');
        console.log('Email:', email);
        console.log('Password length:', password ? password.length : 0);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const user = User.findByEmail(email);
        console.log('User found:', user ? 'YES' : 'NO');

        if (!user) {
            console.log('User not found for email:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        console.log('User details:', {
            id: user.id,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            hasPassword: !!user.password,
            passwordLength: user.password ? user.password.length : 0
        });

        const isValidPassword = await User.validatePassword(user, password);
        console.log('Password valid:', isValidPassword);

        if (!isValidPassword) {
            console.log('Password mismatch for user:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Account has been deactivated. Contact support.'
            });
        }

        const token = generateToken(user);

        // Update last seen
        User.setOnlineStatus(user.id, true);

        console.log('Login successful for:', email);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    isVerified: user.isVerified,
                    walletBalance: user.walletBalance,
                    currentLocation: user.currentLocation
                },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Get Current User
router.get('/me', authenticate, (req, res) => {
    try {
        const user = User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
                walletBalance: user.walletBalance,
                currentLocation: user.currentLocation,
                isOnline: user.isOnline,
                rating: user.rating,
                totalRatings: user.totalRatings
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get user data',
            error: error.message
        });
    }
});

// Logout
router.post('/logout', (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (token && req.user) {
            User.setOnlineStatus(req.user.id, false);
        }
        res.json({ success: true, message: 'Logout successful' });
    } catch (error) {
        res.json({ success: true, message: 'Logout successful' });
    }
});

// Debug: Check if admin exists
router.get('/check-admin', (req, res) => {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@qarrib.com';
        const admin = User.findByEmail(adminEmail);

        if (admin) {
            res.json({
                success: true,
                message: 'Admin exists',
                data: {
                    id: admin.id,
                    email: admin.email,
                    role: admin.role,
                    isActive: admin.isActive,
                    isVerified: admin.isVerified,
                    passwordHash: admin.password ? admin.password.substring(0, 20) + '...' : 'none'
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Admin not found. Please restart the server.'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Debug: List all users (for troubleshooting)
router.get('/debug-users', (req, res) => {
    try {
        const users = User.findAll();
        res.json({
            success: true,
            count: users.length,
            data: users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                isActive: u.isActive
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
