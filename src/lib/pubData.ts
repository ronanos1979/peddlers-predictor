export type PubInfo = {
  id: string
  name: string
  city: string
  state: string
  address: string
  phone: string
  phoneFormatted: string
  lat: number
  lng: number
  radius_m: number
  facebook: string
  instagram: string
  mapsUrl: string
}

export const PUB_DATA: Record<string, PubInfo> = {
  haverhill: {
    id: 'haverhill',
    name: "The Peddler's Daughter",
    city: 'Haverhill',
    state: 'MA',
    address: '45 Wingate St., Haverhill, MA 01832',
    phone: '+19783729555',
    phoneFormatted: '(978) 372-9555',
    lat: 42.7762,
    lng: -71.0773,
    radius_m: 200,
    facebook: 'https://www.facebook.com/peddlershaverhill/',
    instagram: 'https://www.instagram.com/peddlershaverhill/',
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=45+Wingate+St+Haverhill+MA+01832',
  },
  nashua: {
    id: 'nashua',
    name: "The Peddler's Daughter",
    city: 'Nashua',
    state: 'NH',
    address: '48 Main St., Nashua, NH 03064',
    phone: '+16038217535',
    phoneFormatted: '(603) 821-7535',
    lat: 42.7654,
    lng: -71.4676,
    radius_m: 200,
    facebook: 'https://www.facebook.com/pg/PeddlersNashua/',
    instagram: 'https://www.instagram.com/peddlersnashua/',
    mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=48+Main+St+Nashua+NH+03064',
  }
}

export const WEBSITE_URL = 'https://www.thepeddlersdaughter.com/'
