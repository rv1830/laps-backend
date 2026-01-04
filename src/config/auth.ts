import dotenv from 'dotenv';
dotenv.config();

export const authConfig = {
    jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_12345',
    // Change: JWT_EXPIRE ko JWT_EXPIRY kiya taaki tere .env se match kare
    jwtExpiresIn: process.env.JWT_EXPIRY || '7d', 
    saltRounds: 10,
};