/**
 * Places for Shabbat times. Candle lighting follows local custom: 20 minutes before sunset in Israel
 * (Jerusalem 40, Haifa and Zichron Ya'akov 30), 18 elsewhere — the same defaults Hebcal uses.
 */
export interface City {
  id: string;
  he: string;
  en: string;
  lat: number;
  lon: number;
  tz: string;
  il: boolean;
  candle: number;
}

const IL = (id: string, he: string, en: string, lat: number, lon: number, candle = 20): City =>
  ({ id, he, en, lat, lon, tz: "Asia/Jerusalem", il: true, candle });
const AB = (id: string, he: string, en: string, lat: number, lon: number, tz: string, candle = 18): City =>
  ({ id, he, en, lat, lon, tz, il: false, candle });

export const CITIES: City[] = [
  IL("jerusalem", "ירושלים", "Jerusalem", 31.778, 35.235, 40),
  IL("tel-aviv", "תל אביב–יפו", "Tel Aviv-Yafo", 32.0853, 34.7818),
  IL("haifa", "חיפה", "Haifa", 32.794, 34.9896, 30),
  IL("beer-sheva", "באר שבע", "Be'er Sheva", 31.2518, 34.7913),
  IL("rishon", "ראשון לציון", "Rishon LeZion", 31.973, 34.7925),
  IL("petah-tikva", "פתח תקווה", "Petah Tikva", 32.0871, 34.8875),
  IL("bnei-brak", "בני ברק", "Bnei Brak", 32.0807, 34.8338),
  IL("ashdod", "אשדוד", "Ashdod", 31.8044, 34.6553),
  IL("netanya", "נתניה", "Netanya", 32.3215, 34.8532),
  IL("holon", "חולון", "Holon", 32.0158, 34.7874),
  IL("ramat-gan", "רמת גן", "Ramat Gan", 32.0684, 34.8248),
  IL("rehovot", "רחובות", "Rehovot", 31.8928, 34.8113),
  IL("ashkelon", "אשקלון", "Ashkelon", 31.6688, 34.5743),
  IL("herzliya", "הרצליה", "Herzliya", 32.1663, 34.8436),
  IL("raanana", "רעננה", "Ra'anana", 32.1848, 34.8713),
  IL("kfar-saba", "כפר סבא", "Kfar Saba", 32.1782, 34.9076),
  IL("modiin", "מודיעין", "Modi'in", 31.8969, 35.0104),
  IL("beit-shemesh", "בית שמש", "Beit Shemesh", 31.7470, 34.9881),
  IL("zichron", "זכרון יעקב", "Zichron Ya'akov", 32.5707, 34.9536, 30),
  IL("hadera", "חדרה", "Hadera", 32.434, 34.9196),
  IL("nazareth-illit", "נוף הגליל", "Nof HaGalil", 32.7056, 35.3209),
  IL("afula", "עפולה", "Afula", 32.6078, 35.2897),
  IL("tiberias", "טבריה", "Tiberias", 32.7922, 35.5312),
  IL("safed", "צפת", "Safed", 32.9646, 35.496),
  IL("nahariya", "נהריה", "Nahariya", 33.0059, 35.0941),
  IL("karmiel", "כרמיאל", "Karmiel", 32.9136, 35.2961),
  IL("eilat", "אילת", "Eilat", 29.5577, 34.9519),
  IL("ariel", "אריאל", "Ariel", 32.1046, 35.1745),
  IL("maale-adumim", "מעלה אדומים", "Ma'ale Adumim", 31.7771, 35.2984),
  AB("new-york", "ניו יורק", "New York", 40.7128, -74.006, "America/New_York"),
  AB("los-angeles", "לוס אנג׳לס", "Los Angeles", 34.0522, -118.2437, "America/Los_Angeles"),
  AB("miami", "מיאמי", "Miami", 25.7617, -80.1918, "America/New_York"),
  AB("chicago", "שיקגו", "Chicago", 41.8781, -87.6298, "America/Chicago"),
  AB("toronto", "טורונטו", "Toronto", 43.6532, -79.3832, "America/Toronto"),
  AB("montreal", "מונטריאול", "Montreal", 45.5019, -73.5674, "America/Toronto"),
  AB("mexico-city", "מקסיקו סיטי", "Mexico City", 19.4326, -99.1332, "America/Mexico_City"),
  AB("buenos-aires", "בואנוס איירס", "Buenos Aires", -34.6037, -58.3816, "America/Argentina/Buenos_Aires"),
  AB("sao-paulo", "סאו פאולו", "São Paulo", -23.5505, -46.6333, "America/Sao_Paulo"),
  AB("london", "לונדון", "London", 51.5074, -0.1278, "Europe/London"),
  AB("manchester", "מנצ׳סטר", "Manchester", 53.4808, -2.2426, "Europe/London"),
  AB("paris", "פריז", "Paris", 48.8566, 2.3522, "Europe/Paris"),
  AB("antwerp", "אנטוורפן", "Antwerp", 51.2194, 4.4025, "Europe/Brussels"),
  AB("amsterdam", "אמסטרדם", "Amsterdam", 52.3676, 4.9041, "Europe/Amsterdam"),
  AB("berlin", "ברלין", "Berlin", 52.52, 13.405, "Europe/Berlin"),
  AB("rome", "רומא", "Rome", 41.9028, 12.4964, "Europe/Rome"),
  AB("moscow", "מוסקבה", "Moscow", 55.7558, 37.6173, "Europe/Moscow"),
  AB("kyiv", "קייב", "Kyiv", 50.4501, 30.5234, "Europe/Kyiv"),
  AB("johannesburg", "יוהנסבורג", "Johannesburg", -26.2041, 28.0473, "Africa/Johannesburg"),
  AB("melbourne", "מלבורן", "Melbourne", -37.8136, 144.9631, "Australia/Melbourne"),
  AB("sydney", "סידני", "Sydney", -33.8688, 151.2093, "Australia/Sydney"),
];

export const cityById = (id: string) => CITIES.find((c) => c.id === id);

/** A place counts as Israel for the default candle minutes when it lies within Israel's rough bounds. */
export function looksLikeIsrael(lat: number, lon: number): boolean {
  return lat > 29.4 && lat < 33.4 && lon > 34.2 && lon < 35.95;
}
