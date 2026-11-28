/**
 * Short explanations and icons for the built-in Jewish holidays, to help understand each day.
 * Written for this app (inspired by the idea of Hebcal's per-holiday notes and emoji, not copied).
 * `wiki` holds article titles for a "read more" link (Wikipedia search, so a renamed article still resolves).
 */
import type { Locale } from "../calendars/types";

export interface HolidayInfo {
  emoji: string;
  he: string;
  en: string;
  wiki: { he: string; en: string };
}

const FAST = "🕯️";

const INFO: Record<string, HolidayInfo> = {
  candles: {
    emoji: "🕯️",
    he: "הדלקת נרות שבת או חג, לפני השקיעה לפי מנהג המקום (בדרך כלל 20 דקות בארץ, 40 בירושלים, 30 בחיפה, 18 בחו״ל). כשחג נמשך ישירות משבת או מיום טוב קודם, מדליקים רק אחרי צאת הכוכבים.",
    en: "Lighting the Shabbat or festival candles, before sunset by local custom (usually 18 minutes; 20 in Israel, 40 in Jerusalem, 30 in Haifa). When a festival follows Shabbat or another festival day directly, candles are lit only after nightfall.",
    wiki: { he: "הדלקת נרות שבת", en: "Shabbat candles" },
  },
  havdalah: {
    emoji: "🍷",
    he: "צאת השבת או החג. אומרים הבדלה על כוס יין, בשמים ונר — לפי צאת הכוכבים או מספר דקות קבוע אחרי השקיעה, כפי שנבחר בהגדרות היומן.",
    en: "The end of Shabbat or the festival. Havdalah is said over wine, spices and a flame — at nightfall, or a fixed number of minutes after sunset, as chosen in the calendar's settings.",
    wiki: { he: "הבדלה", en: "Havdalah" },
  },
  "rosh-hashana": {
    emoji: "🍎",
    he: "ראש השנה העברית, א׳–ב׳ בתשרי. תוקעים בשופר, אוכלים תפוח בדבש לשנה מתוקה, ופותחים את עשרת ימי התשובה.",
    en: "The Jewish New Year, 1–2 Tishrei. The shofar is sounded, apples are dipped in honey for a sweet year, and the Ten Days of Repentance begin.",
    wiki: { he: "ראש השנה", en: "Rosh Hashanah" },
  },
  "erev-rosh-hashana": {
    emoji: "🍎",
    he: "היום האחרון של השנה. נוהגים לעשות התרת נדרים, ובערב מתחיל ראש השנה בסעודה חגיגית.",
    en: "The last day of the year. Many perform the annulment of vows; Rosh Hashana begins at sunset with a festive meal.",
    wiki: { he: "ראש השנה", en: "Rosh Hashanah" },
  },
  "tzom-gedaliah": {
    emoji: FAST,
    he: "צום מהזריחה עד צאת הכוכבים, לזכר רצח גדליה בן אחיקם, מושל יהודה אחרי חורבן בית ראשון. כשחל בשבת נדחה ליום ראשון.",
    en: "A dawn-to-nightfall fast mourning the murder of Gedaliah ben Achikam, governor of Judah after the First Temple's destruction. Postponed to Sunday when it falls on Shabbat.",
    wiki: { he: "צום גדליה", en: "Fast of Gedaliah" },
  },
  "erev-yom-kippur": {
    emoji: "🕊️",
    he: "ערב יום הכיפורים: מבקשים סליחה זה מזה, אוכלים סעודה מפסקת לפני הצום, ובערב נאמרת תפילת כל נדרי.",
    en: "The eve of Yom Kippur: people ask one another's forgiveness and eat a final meal before the fast; Kol Nidre is said in the evening.",
    wiki: { he: "יום הכיפורים", en: "Yom Kippur" },
  },
  "yom-kippur": {
    emoji: "🕊️",
    he: "היום הקדוש בשנה, י׳ בתשרי. צום של כ־25 שעות המוקדש לתפילה, לחשבון נפש ולכפרה, ומסתיים בתקיעת שופר.",
    en: "The holiest day of the year, 10 Tishrei: a 25-hour fast devoted to prayer, reflection and atonement, ending with a blast of the shofar.",
    wiki: { he: "יום הכיפורים", en: "Yom Kippur" },
  },
  "erev-sukkot": {
    emoji: "🌿",
    he: "ערב סוכות: מסיימים לבנות ולקשט את הסוכה ומכינים את ארבעת המינים.",
    en: "The eve of Sukkot: the sukkah is finished and decorated, and the four species are prepared.",
    wiki: { he: "סוכות", en: "Sukkot" },
  },
  sukkot: {
    emoji: "🌿",
    he: "חג הסוכות זוכר את נדודי בני ישראל במדבר וחוגג את אסיף התבואה. יושבים בסוכה ומברכים על ארבעת המינים. הימים שבאמצע הם חול המועד.",
    en: "Sukkot recalls the Israelites' journey through the desert and celebrates the harvest. Meals are eaten in the sukkah and a blessing is said over the four species; the middle days are Chol HaMoed.",
    wiki: { he: "סוכות", en: "Sukkot" },
  },
  "hoshana-raba": {
    emoji: "🌿",
    he: "היום השביעי של סוכות. מקיפים את בית הכנסת שבע פעמים עם ארבעת המינים וחובטים בערבות. לפי המסורת, נחתם בו הדין.",
    en: "The seventh day of Sukkot: seven circuits around the synagogue with the four species and the beating of willow branches; by tradition, the final sealing of judgment.",
    wiki: { he: "הושענא רבה", en: "Hoshana Rabbah" },
  },
  "shmini-atzeret": {
    emoji: "📜",
    he: "החג שבא מיד אחרי סוכות. מתחילים להתפלל על הגשם. בארץ ישראל הוא גם שמחת תורה: מסיימים את קריאת התורה ומתחילים מבראשית, בריקודים ובהקפות.",
    en: "The festival right after Sukkot, when the prayer for rain begins. In Israel it is also Simchat Torah: the annual Torah reading is completed and begun again, with dancing.",
    wiki: { he: "שמיני עצרת", en: "Shemini Atzeret" },
  },
  "simchat-torah": {
    emoji: "📜",
    he: "בחוץ לארץ, היום שאחרי שמיני עצרת: מסיימים את מחזור קריאת התורה השנתי, מתחילים אותו מחדש, ורוקדים עם ספרי התורה.",
    en: "Outside Israel, the day after Shemini Atzeret: the yearly cycle of Torah reading is completed and begun again, with dancing around the Torah scrolls.",
    wiki: { he: "שמחת תורה", en: "Simchat Torah" },
  },
  sigd: {
    emoji: "⛰️",
    he: "חג של יהודי אתיופיה, 50 יום אחרי יום הכיפורים. מתפללים לכיוון ירושלים ומחדשים את הברית. מאז 2008 הוא חג ממלכתי בישראל.",
    en: "A festival of Ethiopian Jews, 50 days after Yom Kippur, with prayer facing Jerusalem and renewal of the covenant; a national holiday in Israel since 2008.",
    wiki: { he: "סיגד", en: "Sigd" },
  },
  chanukah: {
    emoji: "🕎",
    he: "שמונה ימים מכ״ה בכסלו, לזכר חנוכת המקדש בימי החשמונאים ונס פך השמן. בכל ערב מדליקים נר נוסף בחנוכייה.",
    en: "Eight days from 25 Kislev, recalling the Maccabees' rededication of the Temple and the miracle of the oil. One more candle is lit each evening.",
    wiki: { he: "חנוכה", en: "Hanukkah" },
  },
  "chag-habanot": {
    emoji: "💐",
    he: "חג הבנות של יהודי צפון אפריקה, בראש חודש טבת בתוך חנוכה. מוקדש לנשים ולבנות, ומזכיר את גבורת יהודית.",
    en: "The Festival of Daughters of North African Jewry, on Rosh Chodesh Tevet during Chanukah, honouring women and girls and recalling the courage of Judith.",
    wiki: { he: "חג הבנות", en: "Eid al-Banat" },
  },
  "asara-btevet": {
    emoji: FAST,
    he: "צום לזכר תחילת המצור הבבלי על ירושלים. בישראל זה גם יום הקדיש הכללי, לנספי השואה שיום מותם אינו ידוע.",
    en: "A fast recalling the start of the Babylonian siege of Jerusalem; in Israel also the General Kaddish Day for Holocaust victims whose date of death is unknown.",
    wiki: { he: "עשרה בטבת", en: "Tenth of Tevet" },
  },
  "tu-bishvat": {
    emoji: "🌳",
    he: "ראש השנה לאילנות. אוכלים פירות, במיוחד משבעת המינים, ונוטעים עצים.",
    en: "The New Year for Trees. Fruits are eaten, especially the seven species of the Land of Israel, and trees are planted.",
    wiki: { he: "ט״ו בשבט", en: "Tu BiShvat" },
  },
  "purim-katan": {
    emoji: "🎭",
    he: "בשנה מעוברת, הד לפורים באדר א׳: יום שמחה קטן, בלי קריאת מגילה.",
    en: "In a leap year, Purim's echo in Adar I: a minor day of joy, without reading the Megillah.",
    wiki: { he: "פורים קטן", en: "Purim Katan" },
  },
  "taanit-esther": {
    emoji: FAST,
    he: "צום לפני פורים לזכר צום אסתר ועם ישראל לפני פגישתה עם המלך. כשחל בשבת מוקדם ליום חמישי.",
    en: "A fast before Purim recalling the fast of Esther and the people before she went to the king. Moved back to Thursday when it falls on Shabbat.",
    wiki: { he: "תענית אסתר", en: "Fast of Esther" },
  },
  purim: {
    emoji: "🎭",
    he: "זכר להצלת יהודי פרס כמסופר במגילת אסתר. קוראים במגילה, שולחים משלוחי מנות, נותנים מתנות לאביונים, עורכים סעודה ומתחפשים.",
    en: "Celebrates the deliverance of the Jews of Persia told in the Book of Esther: the Megillah is read, gifts of food and gifts to the poor are given, there is a festive meal and costumes.",
    wiki: { he: "פורים", en: "Purim" },
  },
  "shushan-purim": {
    emoji: "🎭",
    he: "פורים בערים המוקפות חומה מימות יהושע, כמו ירושלים. שם חוגגים יום אחד אחרי שאר המקומות.",
    en: "Purim in cities walled since Joshua's time, such as Jerusalem, which celebrate a day later.",
    wiki: { he: "שושן פורים", en: "Shushan Purim" },
  },
  "taanit-bechorot": {
    emoji: FAST,
    he: "תענית בכורות בערב פסח, לזכר הצלת בכורי ישראל במכת בכורות. נהוג להשתתף בסיום מסכת שפוטר מהצום.",
    en: "The Fast of the Firstborn on the eve of Pesach, for the sparing of Israel's firstborn; it is customary to attend a siyum, which releases them from fasting.",
    wiki: { he: "תענית בכורות", en: "Fast of the Firstborn" },
  },
  "erev-pesach": {
    emoji: "🫓",
    he: "מבערים ושורפים את החמץ, ובערב יושבים לליל הסדר: קוראים בהגדה, אוכלים מצה ומרור ושותים ארבע כוסות.",
    en: "Chametz is cleared out and burned; in the evening comes the Seder, with the Haggadah, matzah, bitter herbs and four cups of wine.",
    wiki: { he: "ליל הסדר", en: "Passover Seder" },
  },
  pesach: {
    emoji: "🫓",
    he: "חג החירות לזכר יציאת מצרים. במשך החג אוכלים מצה ולא חמץ. בארץ ישראל הוא נמשך שבעה ימים ובחוץ לארץ שמונה, והימים שבאמצע הם חול המועד.",
    en: "The festival of freedom recalling the Exodus from Egypt. Matzah is eaten and no leaven; seven days in Israel, eight outside it, with Chol HaMoed in between.",
    wiki: { he: "פסח", en: "Passover" },
  },
  "pesach-7": {
    emoji: "🌊",
    he: "שביעי של פסח, היום האחרון של החג בארץ ישראל. לפי המסורת, ביום הזה נבקע ים סוף.",
    en: "The seventh day of Pesach, its last day in Israel; by tradition, the day the Red Sea parted.",
    wiki: { he: "שביעי של פסח", en: "Passover" },
  },
  "yom-hashoah": {
    emoji: FAST,
    he: "יום הזיכרון לשואה ולגבורה. בעשר בבוקר נשמעת צפירה של שתי דקות.",
    en: "Holocaust and Heroism Remembrance Day. A two-minute siren sounds across Israel at 10 a.m.",
    wiki: { he: "יום הזיכרון לשואה ולגבורה", en: "Yom HaShoah" },
  },
  "yom-hazikaron": {
    emoji: FAST,
    he: "יום הזיכרון לחללי מערכות ישראל ולנפגעי פעולות האיבה. נשמעות צפירות בערב ובבוקר, ובצאת היום מתחיל יום העצמאות.",
    en: "Memorial Day for Israel's fallen soldiers and victims of terror, with sirens in the evening and morning; Independence Day begins as it ends.",
    wiki: { he: "יום הזיכרון לחללי מערכות ישראל ונפגעי פעולות האיבה", en: "Yom HaZikaron" },
  },
  "yom-haatzmaut": {
    emoji: "🇮🇱",
    he: "יום העצמאות של מדינת ישראל, לזכר ההכרזה על הקמתה בה׳ באייר תש״ח (14 במאי 1948).",
    en: "Israel's Independence Day, marking the declaration of the state on 5 Iyar 5708 (14 May 1948).",
    wiki: { he: "יום העצמאות", en: "Yom Ha'atzmaut" },
  },
  "pesach-sheni": {
    emoji: "🫓",
    he: "הזדמנות שנייה, חודש אחרי פסח, להקריב את קרבן הפסח למי שהיה טמא או רחוק. נוהגים לאכול בו מצה.",
    en: "A second chance, a month after Pesach, to bring the Passover offering for those who had been impure or far away; many eat matzah.",
    wiki: { he: "פסח שני", en: "Pesach Sheni" },
  },
  "lag-baomer": {
    emoji: "🔥",
    he: "היום ה־33 בספירת העומר. מדליקים מדורות, ומציינים את ההילולה של רבי שמעון בר יוחאי ואת סוף המגפה בתלמידי רבי עקיבא.",
    en: "The 33rd day of the Omer: bonfires, the hillula of Rabbi Shimon bar Yochai, and by tradition the end of the plague among Rabbi Akiva's students.",
    wiki: { he: "ל״ג בעומר", en: "Lag BaOmer" },
  },
  "yom-yerushalayim": {
    emoji: "🏛️",
    he: "יום ירושלים: איחוד העיר במלחמת ששת הימים, כ״ח באייר תשכ״ז.",
    en: "Jerusalem Day, marking the city's reunification in the Six-Day War, 28 Iyar 5727.",
    wiki: { he: "יום ירושלים", en: "Jerusalem Day" },
  },
  "erev-shavuot": {
    emoji: "🌾",
    he: "ערב שבועות. בלילה רבים נשארים ערים ללימוד תורה, וזה נקרא תיקון ליל שבועות.",
    en: "The eve of Shavuot; many stay up through the night studying Torah (Tikkun Leil Shavuot).",
    wiki: { he: "שבועות", en: "Shavuot" },
  },
  shavuot: {
    emoji: "🌾",
    he: "חג מתן תורה וחג הביכורים, 50 יום אחרי פסח. אוכלים מאכלי חלב וקוראים את מגילת רות.",
    en: "The festival of the giving of the Torah and of first fruits, 50 days after Pesach; dairy foods are eaten and the Book of Ruth is read.",
    wiki: { he: "שבועות", en: "Shavuot" },
  },
  "tzom-tammuz": {
    emoji: FAST,
    he: "צום לזכר הבקעת חומות ירושלים. הוא פותח את שלושת השבועות של בין המצרים, עד תשעה באב. כשחל בשבת נדחה ליום ראשון.",
    en: "A fast for the breach of Jerusalem's walls, opening the Three Weeks of mourning until Tish'a B'Av. Postponed to Sunday when it falls on Shabbat.",
    wiki: { he: "שבעה עשר בתמוז", en: "Seventeenth of Tammuz" },
  },
  "erev-tisha-bav": {
    emoji: FAST,
    he: "לפני השקיעה אוכלים סעודה מפסקת, ואז מתחיל צום תשעה באב.",
    en: "A final meal before sunset, when the fast of Tish'a B'Av begins.",
    wiki: { he: "תשעה באב", en: "Tisha B'Av" },
  },
  "tisha-bav": {
    emoji: FAST,
    he: "יום אבל על חורבן בית המקדש הראשון והשני ועל אסונות נוספים. צום של כ־25 שעות וקריאת מגילת איכה. כשחל בשבת נדחה ליום ראשון.",
    en: "A day of mourning for the destruction of the First and Second Temples and later calamities: a 25-hour fast and the reading of Lamentations. Postponed to Sunday after Shabbat.",
    wiki: { he: "תשעה באב", en: "Tisha B'Av" },
  },
  "tu-bav": {
    emoji: "❤️",
    he: "חג האהבה העברי. בימי הבית השני יצאו בו הבנות לחולל בכרמים, והיום זה יום של שמחה, חתונות ואהבה.",
    en: "The Hebrew day of love: in Second Temple times maidens danced in the vineyards; today a joyful day for weddings and romance.",
    wiki: { he: "ט״ו באב", en: "Tu B'Av" },
  },
  "rosh-hashana-labehemot": {
    emoji: "🐑",
    he: "לפי המשנה, ראש השנה למעשר בהמה, אחד מארבעת ראשי השנה. ביום הזה גם מתחיל חודש אלול.",
    en: "In the Mishnah, the new year for tithing animals — one of the four new years; it also opens the month of Elul.",
    wiki: { he: "ראש השנה למעשר בהמה", en: "Rosh Hashana LaBehemot" },
  },
  "leil-selichot": {
    emoji: "🙏",
    he: "תחילת אמירת הסליחות במנהג האשכנזים, במוצאי שבת שלפני ראש השנה. הספרדים, עדות המזרח והתימנים אומרים סליחות כבר מתחילת חודש אלול. אצל יהודי תימן הן נקראות ״אשמורות״.",
    en: "Ashkenazim begin reciting Selichot (penitential prayers) on the Saturday night before Rosh Hashana; Sephardim, Mizrahi and Yemenite Jews from the start of Elul. Yemenite Jews call them \"Ashmurot\".",
    wiki: { he: "סליחות", en: "Selichot" },
  },
  "rosh-chodesh": {
    emoji: "🌒",
    he: "תחילת החודש העברי, עם מולד הירח. מוסיפים תפילת הלל ומוסף. כשבחודש הקודם יש 30 יום, ראש החודש נמשך יומיים.",
    en: "The start of a Hebrew month, at the new moon, with Hallel and Musaf prayers; when the previous month has 30 days it lasts two days.",
    wiki: { he: "ראש חודש", en: "Rosh Chodesh" },
  },
};

/** Which explanation a holiday rule id uses (multi-day festivals share one). */
export function holidayInfoKey(id: string): string {
  if (/^rosh-hashana-\d$/.test(id)) return "rosh-hashana";
  if (id === "sukkot-7") return "hoshana-raba";
  if (/^sukkot-/.test(id)) return "sukkot";
  if (id === "pesach-7") return "pesach-7";
  if (/^pesach-\d/.test(id)) return "pesach";
  if (/^chanukah-/.test(id)) return "chanukah";
  if (/^shavuot-/.test(id)) return "shavuot";
  if (/^rosh-chodesh-/.test(id)) return "rosh-chodesh";
  if (id === "shushan-purim-katan") return "purim-katan";
  if (id === "erev-purim") return "purim";
  return id;
}

export function holidayInfo(id: string): HolidayInfo | undefined {
  return INFO[holidayInfoKey(id)];
}

export function holidayText(id: string, locale: Locale): string {
  return holidayInfo(id)?.[locale] ?? "";
}

/** "Read more" link (Wikipedia search, which jumps straight to the article when the title matches). */
export function holidayLink(id: string, locale: Locale): string | undefined {
  const info = holidayInfo(id);
  if (!info) return undefined;
  const host = locale === "he" ? "he.wikipedia.org" : "en.wikipedia.org";
  return `https://${host}/w/index.php?search=${encodeURIComponent(info.wiki[locale])}&go=Go`;
}

export const HOLIDAY_INFO_KEYS = Object.keys(INFO);
