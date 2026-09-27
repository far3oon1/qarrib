const Database = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class User {
    constructor() {
        this.db = new Database('users');
    }

    async create(userData) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        const user = {
            id: uuidv4(),
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            password: hashedPassword,
            role: userData.role, // 'patient', 'nurse', 'admin'
            nationalId: userData.nationalId || null,
            address: userData.address || null,

            // Nurse-specific fields
            isVerified: userData.role === 'nurse' ? false : true,
            verificationStatus: userData.role === 'nurse' ? 'pending' : 'approved',
            licenseNumber: userData.licenseNumber || null,
            specialization: userData.specialization || null,
            yearsOfExperience: userData.yearsOfExperience || 0,
            rating: 0,
            totalRatings: 0,

            // Location
            currentLocation: userData.currentLocation || null,

            // Wallet balance (in cents/pennies for precision)
            walletBalance: 0,

            // Status
            isActive: true,
            isOnline: false,
            lastSeen: new Date().toISOString(),

            // Documents
            idCardImage: null,
            licenseImage: null,

            createdAt: new Date().toISOString()
        };

        return this.db.insert(user);
    }

    findAll(query = {}) {
        return this.db.find(query);
    }

    findById(id) {
        return this.db.findById(id);
    }

    findByEmail(email) {
        return this.db.findOne({ email });
    }

    findByPhone(phone) {
        return this.db.findOne({ phone });
    }

    async validatePassword(user, password) {
        if (!user || !user.password) return false;
        return await bcrypt.compare(password, user.password);
    }

    update(id, updates) {
        // Don't allow password update through this method
        delete updates.password;
        return this.db.updateById(id, updates);
    }

    updatePassword(id, newPassword) {
        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        return this.db.updateById(id, { password: hashedPassword });
    }

    updateWallet(id, amount) {
        const user = this.findById(id);
        if (!user) return null;
        const newBalance = user.walletBalance + amount;
        return this.db.updateById(id, { walletBalance: newBalance });
    }

    updateLocation(id, location) {
        return this.db.updateById(id, { 
            currentLocation: location,
            lastSeen: new Date().toISOString()
        });
    }

    setOnlineStatus(id, isOnline) {
        return this.db.updateById(id, { 
            isOnline,
            lastSeen: new Date().toISOString()
        });
    }

    delete(id) {
        return this.db.deleteById(id);
    }

    // Get nearby nurses based on location
    getNearbyNurses(location, maxDistance = 10) {
        const nurses = this.db.find({ role: 'nurse', isVerified: true, isActive: true });

        if (!location || !location.lat || !location.lng) return nurses;

        return nurses.filter(nurse => {
            if (!nurse.currentLocation) return false;
            const distance = this.calculateDistance(
                location.lat, location.lng,
                nurse.currentLocation.lat, nurse.currentLocation.lng
            );
            return distance <= maxDistance;
        }).sort((a, b) => {
            const distA = this.calculateDistance(location.lat, location.lng, a.currentLocation?.lat, a.currentLocation?.lng);
            const distB = this.calculateDistance(location.lat, location.lng, b.currentLocation?.lat, b.currentLocation?.lng);
            return distA - distB;
        });
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
}

module.exports = new User();
