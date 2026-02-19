import { useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { calculateSLAStatus, getSLADeadline, generateId } from '@/lib/constants'
import type { ServiceRequest, RequestUpdate } from '@/lib/types'

const SLA_CHECK_INTERVAL = 60 * 1000

export function useSLATracking() {
  const [requests, setRequests] = useKV<ServiceRequest[]>('service_requests', [])
  const [updates, setUpdates] = useKV<RequestUpdate[]>('request_updates', [])

  useEffect(() => {
    const checkAndUpdateSLA = () => {
      const requestsList = requests || []
      const now = new Date().toISOString()
      let hasChanges = false
      const updatedRequests: ServiceRequest[] = []
      const newUpdates: RequestUpdate[] = []

      requestsList.forEach(request => {
        if (!request.slaDeadline) {
          request.slaDeadline = getSLADeadline(request)
        }

        const currentSLAStatus = calculateSLAStatus(request)
        
        if (currentSLAStatus !== request.slaStatus) {
          hasChanges = true
          
          const updatedRequest: ServiceRequest = {
            ...request,
            slaStatus: currentSLAStatus,
            updatedAt: now
          }

          if (currentSLAStatus === 'breached' && !request.slaBreachedAt) {
            updatedRequest.slaBreachedAt = now
            
            const breachUpdate: RequestUpdate = {
              id: generateId(),
              requestId: request.id,
              message: 'تم تجاوز الموعد المحدد لحل الطلب (SLA)',
              isInternal: false,
              createdAt: now
            }
            
            newUpdates.push(breachUpdate)
          }
          
          updatedRequests.push(updatedRequest)
        }
      })

      if (hasChanges && updatedRequests.length > 0) {
        setRequests((current) => {
          const currentList = current || []
          const updatedList = currentList.map(req => {
            const updated = updatedRequests.find(u => u.id === req.id)
            return updated || req
          })
          return updatedList
        })

        if (newUpdates.length > 0) {
          setUpdates((current) => [...(current || []), ...newUpdates])
        }
      }
    }

    checkAndUpdateSLA()
    
    const interval = setInterval(checkAndUpdateSLA, SLA_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [requests, setRequests, setUpdates])
}
