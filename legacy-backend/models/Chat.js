const Database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Chat {
    constructor() {
        this.db = new Database('chats');
    }

    create(messageData) {
        const message = {
            id: uuidv4(),
            orderId: messageData.orderId,
            senderId: messageData.senderId,
            senderRole: messageData.senderRole, // 'patient' or 'nurse'

            // Message content
            content: messageData.content,
            type: messageData.type || 'text', // text, image, location

            // If type is location
            location: messageData.location || null,

            // If type is image
            imageUrl: messageData.imageUrl || null,

            // Read status
            isRead: false,
            readAt: null,

            createdAt: new Date().toISOString()
        };

        return this.db.insert(message);
    }

    findByOrder(orderId) {
        return this.db.find({ orderId }).sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
        );
    }

    findById(id) {
        return this.db.findById(id);
    }

    markAsRead(id) {
        return this.db.updateById(id, { 
            isRead: true, 
            readAt: new Date().toISOString() 
        });
    }

    markAllAsRead(orderId, userId) {
        const messages = this.db.find({ orderId });
        messages.forEach(msg => {
            if (msg.senderId !== userId && !msg.isRead) {
                this.db.updateById(msg.id, { 
                    isRead: true, 
                    readAt: new Date().toISOString() 
                });
            }
        });
        return true;
    }

    getUnreadCount(orderId, userId) {
        return this.db.find({ 
            orderId, 
            senderId: { $ne: userId },
            isRead: false 
        }).length;
    }

    delete(id) {
        return this.db.deleteById(id);
    }
}

module.exports = new Chat();
