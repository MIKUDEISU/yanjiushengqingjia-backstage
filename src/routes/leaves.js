import { Router } from 'express'
import { getLeaves, getLeaveById, submitLeave, resubmitLeave } from '../controllers/leaveController.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', getLeaves)
router.get('/:id', getLeaveById)
router.post('/', authorize('student'), submitLeave)
router.put('/:id', authorize('student'), resubmitLeave)

export default router
