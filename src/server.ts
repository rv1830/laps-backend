// ============================================================================
// src/server.ts - Server Startup
// ============================================================================
import 'dotenv/config'; // Load .env variables automatically
import app from './app';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`🚀 LAPS Backend running on port ${PORT}`);
  logger.info(`📊 Bull Dashboard: http://localhost:${PORT}/admin/queues`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
