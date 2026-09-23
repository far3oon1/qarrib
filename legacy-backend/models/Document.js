const Database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Document {
    constructor() {
        this.db = new Database('documents');
    }

    create(docData) {
        const document = {
            id: uuidv4(),
            userId: docData.userId,
            userRole: docData.userRole,

            // Document type
            type: docData.type, // 'national_id', 'nursing_license', 'certificate'

            // File info
            fileName: docData.fileName,
            filePath: docData.filePath,
            fileUrl: docData.fileUrl,

            // Document details
            documentNumber: docData.documentNumber || null,
            issueDate: docData.issueDate || null,
            expiryDate: docData.expiryDate || null,

            // Verification
            status: 'pending', // pending, approved, rejected
            reviewedBy: null,
            reviewNotes: null,
            reviewedAt: null,

            createdAt: new Date().toISOString()
        };

        return this.db.insert(document);
    }

    findAll(query = {}) {
        return this.db.find(query);
    }

    findByUser(userId) {
        return this.db.find({ userId });
    }

    findById(id) {
        return this.db.findById(id);
    }

    findPending() {
        return this.db.find({ status: 'pending' });
    }

    updateStatus(id, status, reviewData = {}) {
        return this.db.updateById(id, {
            status,
            reviewedBy: reviewData.reviewedBy || null,
            reviewNotes: reviewData.reviewNotes || null,
            reviewedAt: new Date().toISOString()
        });
    }

    delete(id) {
        return this.db.deleteById(id);
    }
}

module.exports = new Document();
