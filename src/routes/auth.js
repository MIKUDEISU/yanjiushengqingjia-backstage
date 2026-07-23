import { Router } from 'express'
import { login, getProfile, changePassword } from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/login', login)

router.get('/profile', authenticate, getProfile)

router.put('/password', authenticate, changePassword)

export default router
