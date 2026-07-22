import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initDatabase } from './database.js'
import authRoutes from './routes/auth.js'

const app = express()

app.use(cors())
app.use(express.json())

initDatabase()

app.use('/api/auth', authRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

app.listen(config.port, () => {
  console.log(`[Server] 请假系统后端服务启动成功，端口: ${config.port}`)
})
