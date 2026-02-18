import { useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { shouldEscalatePriority, PRIORITIES, generateId } from '@/lib/constants'
import type { ServiceRequest, RequestUpdate, Priority } from '@/lib/types'

const ESCALATION_CHECK_INTERVAL = 60 * 1000

export function usePriorityEscalation() {
  const [requests, setRequests] = useKV<ServiceRequest[]>('service_requests', [])
  const [updates, setUpdates] = useKV<RequestUpdate[]>('request_updates', [])

  useEffect(() => {
    const checkAndEscalate = () => {
      const requestsList = requests || []
      const now = new Date().toISOString()
      let hasChanges = false
      const escalatedRequests: ServiceRequest[] = []
      const newUpdates: RequestUpdate[] = []

      requestsList.forEach(request => {
        const escalationCheck = shouldEscalatePriority(request)
        
        if (escalationCheck.shouldEscalate && escalationCheck.newPriority) {
          hasChanges = true
          
          const oldPriority = request.priority
          const updatedRequest: ServiceRequest = {
            ...request,
            priority: escalationCheck.newPriority as Priority,
            isAutoEscalated: true,
            priorityEscalatedAt: now,
            updatedAt: now
          }
          
          escalatedRequests.push(updatedRequest)

          const escalationUpdate: RequestUpdate = {
            id: generateId(),
            requestId: request.id,
            message: `تمت ترقية الأولوية تلقائياً من "${PRIORITIES[oldPriority]}" إلى "${PRIORITIES[escalationCheck.newPriority as Priority]}" بعد مرور ${escalationCheck.hoursSinceCreation} ساعة`,
            fromPriority: oldPriority,
            toPriority: escalationCheck.newPriority as Priority,
            isAutoEscalation: true,
            isInternal: false,
            createdAt: now
          }
          
          newUpdates.push(escalationUpdate)
        }
      })

      if (hasChanges && escalatedRequests.length > 0) {
        setRequests((current) => {
          const currentList = current || []
          const updatedList = currentList.map(req => {
            const escalated = escalatedRequests.find(e => e.id === req.id)
            return escalated || req
          })
          return updatedList
        })

        if (newUpdates.length > 0) {
          setUpdates((current) => [...(current || []), ...newUpdates])
        }
      }
    }

    checkAndEscalate()
    
    const interval = setInterval(checkAndEscalate, ESCALATION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [requests, setRequests, setUpdates])
}
