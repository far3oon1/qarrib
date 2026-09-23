const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function changeAdminPassword() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await mongoose.connection.db.collection('users').updateOne(
        { role: 'admin' },
        { $set: { password: hashedPassword } }
    );
    
    if (result.matchedCount === 0) {
        console.log('❌ No admin user found!');
    } else {
        console.log('✅ Admin password changed successfully!');
    }
    
    await mongoose.disconnect();
    process.exit(0);
}

changeAdminPassword().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});