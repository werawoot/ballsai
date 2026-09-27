import type { Locale } from '@/i18n/config'

// English names for the 77 provinces of Thailand, so a reader who chose English sees
// "Chiang Mai" rather than "เชียงใหม่". Province values are stored in Thai as typed by
// users and organizers; this only changes what is shown, never what is stored or
// filtered on (a filter still sends the stored Thai value).
//
// Spellings follow the Royal Thai General System names used by the Department of
// Provincial Administration. A `province` table with English names also exists behind
// /api/provinces (lib/db/thailand-queries.ts), but no file in sql/ creates it, so whether
// it is populated is UNKNOWN; a fixed list needs no query per render and cannot drift.
//
// This file is data, not UI text: it is exempt from the no-new-Thai guard by name.

export const PROVINCE_NAMES_EN: Readonly<Record<string, string>> = {
  'กรุงเทพมหานคร': 'Bangkok',
  'กระบี่': 'Krabi',
  'กาญจนบุรี': 'Kanchanaburi',
  'กาฬสินธุ์': 'Kalasin',
  'กำแพงเพชร': 'Kamphaeng Phet',
  'ขอนแก่น': 'Khon Kaen',
  'จันทบุรี': 'Chanthaburi',
  'ฉะเชิงเทรา': 'Chachoengsao',
  'ชลบุรี': 'Chon Buri',
  'ชัยนาท': 'Chai Nat',
  'ชัยภูมิ': 'Chaiyaphum',
  'ชุมพร': 'Chumphon',
  'เชียงราย': 'Chiang Rai',
  'เชียงใหม่': 'Chiang Mai',
  'ตรัง': 'Trang',
  'ตราด': 'Trat',
  'ตาก': 'Tak',
  'นครนายก': 'Nakhon Nayok',
  'นครปฐม': 'Nakhon Pathom',
  'นครพนม': 'Nakhon Phanom',
  'นครราชสีมา': 'Nakhon Ratchasima',
  'นครศรีธรรมราช': 'Nakhon Si Thammarat',
  'นครสวรรค์': 'Nakhon Sawan',
  'นนทบุรี': 'Nonthaburi',
  'นราธิวาส': 'Narathiwat',
  'น่าน': 'Nan',
  'บึงกาฬ': 'Bueng Kan',
  'บุรีรัมย์': 'Buri Ram',
  'ปทุมธานี': 'Pathum Thani',
  'ประจวบคีรีขันธ์': 'Prachuap Khiri Khan',
  'ปราจีนบุรี': 'Prachin Buri',
  'ปัตตานี': 'Pattani',
  'พระนครศรีอยุธยา': 'Phra Nakhon Si Ayutthaya',
  'พะเยา': 'Phayao',
  'พังงา': 'Phangnga',
  'พัทลุง': 'Phatthalung',
  'พิจิตร': 'Phichit',
  'พิษณุโลก': 'Phitsanulok',
  'เพชรบุรี': 'Phetchaburi',
  'เพชรบูรณ์': 'Phetchabun',
  'แพร่': 'Phrae',
  'ภูเก็ต': 'Phuket',
  'มหาสารคาม': 'Maha Sarakham',
  'มุกดาหาร': 'Mukdahan',
  'แม่ฮ่องสอน': 'Mae Hong Son',
  'ยโสธร': 'Yasothon',
  'ยะลา': 'Yala',
  'ร้อยเอ็ด': 'Roi Et',
  'ระนอง': 'Ranong',
  'ระยอง': 'Rayong',
  'ราชบุรี': 'Ratchaburi',
  'ลพบุรี': 'Lop Buri',
  'ลำปาง': 'Lampang',
  'ลำพูน': 'Lamphun',
  'เลย': 'Loei',
  'ศรีสะเกษ': 'Si Sa Ket',
  'สกลนคร': 'Sakon Nakhon',
  'สงขลา': 'Songkhla',
  'สตูล': 'Satun',
  'สมุทรปราการ': 'Samut Prakan',
  'สมุทรสงคราม': 'Samut Songkhram',
  'สมุทรสาคร': 'Samut Sakhon',
  'สระแก้ว': 'Sa Kaeo',
  'สระบุรี': 'Saraburi',
  'สิงห์บุรี': 'Sing Buri',
  'สุโขทัย': 'Sukhothai',
  'สุพรรณบุรี': 'Suphan Buri',
  'สุราษฎร์ธานี': 'Surat Thani',
  'สุรินทร์': 'Surin',
  'หนองคาย': 'Nong Khai',
  'หนองบัวลำภู': 'Nong Bua Lam Phu',
  'อ่างทอง': 'Ang Thong',
  'อำนาจเจริญ': 'Amnat Charoen',
  'อุดรธานี': 'Udon Thani',
  'อุตรดิตถ์': 'Uttaradit',
  'อุทัยธานี': 'Uthai Thani',
  'อุบลราชธานี': 'Ubon Ratchathani',
}

// How Bangkok is commonly typed; every other province is written in full.
const ALIASES: Readonly<Record<string, string>> = {
  'กรุงเทพฯ': 'กรุงเทพมหานคร',
  'กรุงเทพ': 'กรุงเทพมหานคร',
  'กทม.': 'กรุงเทพมหานคร',
  'กทม': 'กรุงเทพมหานคร',
}

/** The province as the reader should see it. Unknown values show exactly as stored. */
export function provinceName(stored: string, locale: Locale): string {
  if (locale !== 'en') return stored
  const key = stored.trim()
  return PROVINCE_NAMES_EN[ALIASES[key] ?? key] ?? stored
}
