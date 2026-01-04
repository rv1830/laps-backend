import dotenv from 'dotenv';
dotenv.config();

export const authConfig = {
    jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_12345',
    jwtExpiresIn: process.env.JWT_EXPIRY || '7d', 
    saltRounds: 10,
};

// Render (HTTPS) to Vercel (HTTPS) Cookie Settings
export const cookieOptions: any = {
    httpOnly: true,      // Prevent XSS (JS cannot access)
    secure: true,        // REQUIRED: Render terminates SSL, so this must be true
    sameSite: 'none',    // REQUIRED: Cross-Site (Render domain != Vercel domain)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
    path: '/',
};