const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'qarrib_default_secret_change_me';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role,
            name: user.name 
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRE }
    );
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

module.exports = { generateToken, verifyToken, JWT_SECRET };
