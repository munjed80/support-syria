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
        name: 'بلدية دمشق',
        isActive: true,
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
        name,
        isActive: true,
      }))
      setDistricts(newDistricts)

      const newUsers: User[] = [
        {
          id: generateId(),
          username: 'admin_mun',
          fullName: 'أحمد المدير العام',
          role: 'municipal_admin',
          municipalityId: munId,
          isActive: true,
        },
        {
          id: generateId(),
          username: 'district1_admin',
          fullName: 'خالد مدير حي العليا',
          role: 'district_admin',
          municipalityId: munId,
          districtId: newDistricts[0].id,
          isActive: true,
        },
        {
          id: generateId(),
          username: 'district2_admin',
          fullName: 'عبدالله مدير حي الملز',
          role: 'district_admin',
          municipalityId: munId,
          districtId: newDistricts[1].id,
          isActive: true,
        },
        {
          id: generateId(),
          username: 'staff1',
          fullName: 'محمد الفني - العليا',
          role: 'staff',
          municipalityId: munId,
          districtId: newDistricts[0].id,
          isActive: true,
        },
        {
          id: generateId(),
          username: 'staff2',
          fullName: 'سعد الفني - الملز',
          role: 'staff',
          municipalityId: munId,
          districtId: newDistricts[1].id,
          isActive: true,
        }
      ]
      setUsers(newUsers)
    }
  }, [municipalities, setMunicipalities, setDistricts, setUsers])

  return null
}
