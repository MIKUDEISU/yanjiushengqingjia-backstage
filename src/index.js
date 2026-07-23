import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initDatabase, db } from './database.js'
import { seedDatabase } from './utils/seed.js'
import authRoutes from './routes/auth.js'
import leaveRoutes from './routes/leaves.js'
import uploadRoutes from './routes/upload.js'

const app = express()

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(config.uploadDir))

initDatabase()

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count
if (userCount === 0) {
  seedDatabase()
  console.log('[Server] 检测到空数据库，已自动填充测试数据')
}

app.use('/api/auth', authRoutes)
app.use('/api/leaves', leaveRoutes)
app.use('/api/upload', uploadRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.listen(config.port, () => {
  console.log(`[Server] 请假系统后端服务启动成功，端口: ${config.port}`)
})
