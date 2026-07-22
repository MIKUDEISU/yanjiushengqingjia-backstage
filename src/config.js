import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || './data/leave_system.db'),
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || './uploads'),
  nodeEnv: process.env.NODE_ENV || 'development'
}
