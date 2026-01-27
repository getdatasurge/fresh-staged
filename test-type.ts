import { profiles } from './backend/src/db/schema/users.js'

type ProfilesType = typeof profiles

console.log('Profiles type:', ProfilesType)
console.log('Profiles columns:', Object.keys(profiles))
