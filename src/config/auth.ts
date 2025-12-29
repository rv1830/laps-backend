export const authConfig = {
    jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_12345',
    jwtExpiresIn: process.env.JWT_EXPIRE || '7d',
    saltRounds: 10,
};
