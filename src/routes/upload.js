import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const filename = `${uuidv4()}${ext}`
    cb(null, filename)
  }
})

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('不支持的文件类型，仅支持图片、PDF和Word文档'), false)
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

router.post('/', authenticate, upload.array('files', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择要上传的文件' })
    }

    const files = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      filePath: `/uploads/${file.filename}`,
      fileSize: file.size,
      mimeType: file.mimetype
    }))

    res.json({
      code: 200,
      message: `成功上传 ${files.length} 个文件`,
      data: files
    })
  } catch (err) {
    console.error('[Upload] 上传失败:', err)
    res.status(500).json({ code: 500, message: '文件上传失败' })
  }
})

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ code: 400, message: '文件大小超过2MB限制' })
    }
    return res.status(400).json({ code: 400, message: `上传错误: ${err.message}` })
  }
  if (err) {
    return res.status(400).json({ code: 400, message: err.message })
  }
  next()
})

export default router
