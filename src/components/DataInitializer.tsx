import { useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { generateId } from '@/lib/constants'
import type { Municipality, District, User } from '@/lib/types'

export function DataInitializer() {
  const [municipalities, setMunicipalities] = useKV<Municipality[]>('municipalities', [])
  const [districts, setDistricts] = useKV<District[]>('districts', [])
  const [users, setUsers] = useKV<User[]>('users', [])

  useEffect(() => {
    if ((municipalities || []).length === 0) {
      const munId = generateId()
      const newMunicipality: Municipality = {
        id: munId,
        name: 'بلدية الرياض'
      }
      setMunicipalities([newMunicipality])

      const arabicDistricts = [
        'حي العليا',
        'حي الملز',
        'حي النسيم',
        'حي الربوة',
        'حي السليمانية'
      ]

      const newDistricts: District[] = arabicDistricts.map(name => ({
        id: generateId(),
        municipalityId: munId,
        name
      }))
      setDistricts(newDistricts)

      const newUsers: User[] = [
        {
          id: generateId(),
          email: 'admin@mun.sa',
          passwordHash: 'admin123',
          role: 'municipal_admin',
          municipalityId: munId,
          name: 'أحمد المدير العام'
        },
        {
          id: generateId(),
          email: 'district1@mun.sa',
          passwordHash: 'pass123',
          role: 'district_admin',
          municipalityId: munId,
          districtId: newDistricts[0].id,
          name: 'خالد مدير حي العليا'
        },
        {
          id: generateId(),
          email: 'district2@mun.sa',
          passwordHash: 'pass123',
          role: 'district_admin',
          municipalityId: munId,
          districtId: newDistricts[1].id,
          name: 'عبدالله مدير حي الملز'
        },
        {
          id: generateId(),
          email: 'staff1@mun.sa',
          passwordHash: 'staff123',
          role: 'staff',
          municipalityId: munId,
          districtId: newDistricts[0].id,
          name: 'محمد الفني - العليا'
        },
        {
          id: generateId(),
          email: 'staff2@mun.sa',
          passwordHash: 'staff123',
          role: 'staff',
          municipalityId: munId,
          districtId: newDistricts[1].id,
          name: 'سعد الفني - الملز'
        }
      ]
      setUsers(newUsers)
    }
  }, [municipalities, setMunicipalities, setDistricts, setUsers])

  return null
}
