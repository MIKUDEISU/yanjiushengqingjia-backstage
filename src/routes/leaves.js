import { Router } from 'express'
import {
  getLeaves, getLeaveById, submitLeave,
  approveLeave, rejectLeave, returnBackLeave, resubmitLeave,
  applyReturn, approveReturn, rejectReturn,
  applyDelay, approveDelay, rejectDelay
} from '../controllers/leaveController.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()

router.use(authenticate)

router.get('/', getLeaves)

router.get('/:id', getLeaveById)

router.post('/', authorize('student'), submitLeave)

router.put('/:id', authorize('student'), resubmitLeave)

router.post('/:id/approve', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), approveLeave)

router.post('/:id/reject', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), rejectLeave)

router.post('/:id/return-back', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), returnBackLeave)

router.post('/:id/return-apply', authorize('student'), applyReturn)

router.post('/:id/return-approve', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), approveReturn)

router.post('/:id/return-reject', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), rejectReturn)

router.post('/:id/delay-apply', authorize('student'), applyDelay)

router.post('/:id/delay-approve', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), approveDelay)

router.post('/:id/delay-reject', authorize('tutor', 'counselor', 'college_leader', 'party_secretary', 'admin'), rejectDelay)

export default router
