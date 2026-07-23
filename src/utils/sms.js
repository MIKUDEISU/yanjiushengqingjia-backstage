export function sendMockSMS(phone, studentName, duration, action, extraReason = '') {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN')

  let content = ''
  const actionMap = {
    'approved': `【学校通知】尊敬的家长您好，您的孩子${studentName}申请请假${duration}天，审批结果：通过。请关注孩子的离校与返校安排。如有疑问请联系辅导员。`,
    'rejected': `【学校通知】尊敬的家长您好，您的孩子${studentName}申请请假${duration}天，审批结果：未通过。原因：${extraReason || '审批未通过'}。如有疑问请联系辅导员。`,
    'returned': `【学校通知】尊敬的家长您好，您的孩子${studentName}的请假申请已被退回修改。原因：${extraReason || '请修改后重新提交'}。`,
    'return_approved': `【学校通知】尊敬的家长您好，您的孩子${studentName}的返校申请已审批通过，请提醒孩子按时返校。`,
    'delay_approved': `【学校通知】尊敬的家长您好，您的孩子${studentName}的延期返校申请已审批通过，请关注更新后的返校时间。`,
    'delay_rejected': `【学校通知】尊敬的家长您好，您的孩子${studentName}的延期返校申请未通过。原因：${extraReason || '延期申请被驳回'}。`,
  }

  content = actionMap[action] || `【学校通知】关于您孩子${studentName}的请假申请有新的进展，请登录系统查看详情。`

  const smsRecord = {
    phone,
    content,
    action,
    sentAt: timeStr,
    status: 'success'
  }

  console.log('═══════════════════════════════════════════')
  console.log('  📱 [模拟短信发送]')
  console.log(`  收信号码: ${phone}`)
  console.log(`  发送时间: ${timeStr}`)
  console.log(`  短信内容: ${content}`)
  console.log(`  发送状态: ✅ 成功`)
  console.log('═══════════════════════════════════════════')

  return smsRecord
}
