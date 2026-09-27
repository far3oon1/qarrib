const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/database');

const seedAdmin = async () => {
  try {
    await connectDB();

    const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@qarrab.com';
    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@Qarrab123';

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('✅ Admin already exists:', adminEmail);
      process.exit(0);
    }

    const admin = await User.create({
      fullName: 'System Administrator',
      email: adminEmail,
      phone: '01000000000',
      password: adminPassword,
      nationalId: '00000000000000',
      role: 'admin',
      status: 'active',
      isActive: true
    });

    console.log('✅ Admin created successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('Please change the default password after first login.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
