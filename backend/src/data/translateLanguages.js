/**
 * The languages Google Cloud Translation can deliver news in. This is the
 * service's own list, deduplicated: the aliases Google still answers to (tl for
 * Filipino, iw for Hebrew, jv for Javanese, plain zh for Simplified Chinese) are
 * folded into the one code the site stores, and the regional spellings are
 * dropped because a reader chooses a language, not a dialect.
 *
 * A reader can still type any other code: the service is what decides, and when
 * it refuses, the story stays in English and the page says so.
 */

const languages = [
  ['af', 'Afrikaans'], ['sq', 'Albanian'], ['alz', 'Alur'], ['am', 'Amharic'], ['ar', 'Arabic'],
  ['hy', 'Armenian'], ['as', 'Assamese'], ['awa', 'Awadhi'], ['ay', 'Aymara'], ['az', 'Azerbaijani'],
  ['ban', 'Balinese'], ['bm', 'Bambara'], ['ba', 'Bashkir'], ['eu', 'Basque'], ['btx', 'Batak Karo'],
  ['bts', 'Batak Simalungun'], ['bbc', 'Batak Toba'], ['be', 'Belarusian'], ['bem', 'Bemba'], ['bn', 'Bengali'],
  ['bew', 'Betawi'], ['bho', 'Bhojpuri'], ['bik', 'Bikol'], ['bs', 'Bosnian'], ['br', 'Breton'],
  ['bg', 'Bulgarian'], ['bua', 'Buryat'], ['yue', 'Cantonese'], ['ca', 'Catalan'], ['ceb', 'Cebuano'],
  ['ny', 'Chichewa'], ['zh-CN', 'Chinese (Simplified)'], ['zh-TW', 'Chinese (Traditional)'], ['cv', 'Chuvash'],
  ['co', 'Corsican'], ['crh', 'Crimean Tatar'], ['hr', 'Croatian'], ['cs', 'Czech'], ['da', 'Danish'],
  ['din', 'Dinka'], ['dv', 'Divehi'], ['doi', 'Dogri'], ['dov', 'Dombe'], ['nl', 'Dutch'], ['dz', 'Dzongkha'],
  ['en', 'English'], ['eo', 'Esperanto'], ['et', 'Estonian'], ['ee', 'Ewe'], ['fj', 'Fijian'],
  ['fil', 'Filipino'], ['fi', 'Finnish'], ['fr', 'French'], ['fy', 'Frisian'], ['ff', 'Fulfulde'],
  ['gaa', 'Ga'], ['gl', 'Galician'], ['lg', 'Ganda'], ['ka', 'Georgian'], ['de', 'German'], ['el', 'Greek'],
  ['gn', 'Guarani'], ['gu', 'Gujarati'], ['ht', 'Haitian Creole'], ['cnh', 'Hakha Chin'], ['ha', 'Hausa'],
  ['haw', 'Hawaiian'], ['he', 'Hebrew'], ['hil', 'Hiligaynon'], ['hi', 'Hindi'], ['hmn', 'Hmong'],
  ['hu', 'Hungarian'], ['hrx', 'Hunsrik'], ['is', 'Icelandic'], ['ig', 'Igbo'], ['ilo', 'Iloko'],
  ['id', 'Indonesian'], ['ga', 'Irish'], ['it', 'Italian'], ['ja', 'Japanese'], ['jw', 'Javanese'],
  ['kn', 'Kannada'], ['pam', 'Kapampangan'], ['kk', 'Kazakh'], ['km', 'Khmer'], ['cgg', 'Kiga'],
  ['rw', 'Kinyarwanda'], ['ktu', 'Kituba'], ['gom', 'Konkani'], ['ko', 'Korean'], ['kri', 'Krio'],
  ['ku', 'Kurdish (Kurmanji)'], ['ckb', 'Kurdish (Sorani)'], ['ky', 'Kyrgyz'], ['lo', 'Lao'],
  ['ltg', 'Latgalian'], ['la', 'Latin'], ['lv', 'Latvian'], ['lij', 'Ligurian'], ['li', 'Limburgan'],
  ['ln', 'Lingala'], ['lt', 'Lithuanian'], ['lmo', 'Lombard'], ['luo', 'Luo'], ['lb', 'Luxembourgish'],
  ['mk', 'Macedonian'], ['mai', 'Maithili'], ['mak', 'Makassar'], ['mg', 'Malagasy'], ['ms', 'Malay'],
  ['ml', 'Malayalam'], ['mt', 'Maltese'], ['mi', 'Maori'], ['mr', 'Marathi'], ['chm', 'Meadow Mari'],
  ['mni-Mtei', 'Meiteilon'], ['min', 'Minang'], ['lus', 'Mizo'], ['mn', 'Mongolian'], ['my', 'Myanmar'],
  ['nr', 'Ndebele'], ['new', 'Nepalbhasa'], ['ne', 'Nepali'], ['nso', 'Northern Sotho'], ['no', 'Norwegian'],
  ['nus', 'Nuer'], ['oc', 'Occitan'], ['om', 'Oromo'], ['or', 'Odia'], ['pag', 'Pangasinan'],
  ['pap', 'Papiamento'], ['ps', 'Pashto'], ['fa', 'Persian'], ['pl', 'Polish'], ['pt', 'Portuguese'],
  ['pa', 'Punjabi'], ['qu', 'Quechua'], ['rom', 'Romani'], ['ro', 'Romanian'], ['rn', 'Rundi'],
  ['ru', 'Russian'], ['sm', 'Samoan'], ['sg', 'Sango'], ['sa', 'Sanskrit'], ['gd', 'Scots Gaelic'],
  ['sr', 'Serbian'], ['st', 'Sesotho'], ['crs', 'Seychellois Creole'], ['shn', 'Shan'], ['sn', 'Shona'],
  ['scn', 'Sicilian'], ['szl', 'Silesian'], ['sd', 'Sindhi'], ['si', 'Sinhala'], ['sk', 'Slovak'],
  ['sl', 'Slovenian'], ['so', 'Somali'], ['es', 'Spanish'], ['su', 'Sundanese'], ['sw', 'Swahili'],
  ['ss', 'Swati'], ['sv', 'Swedish'], ['tg', 'Tajik'], ['ta', 'Tamil'], ['tt', 'Tatar'], ['te', 'Telugu'],
  ['tet', 'Tetum'], ['th', 'Thai'], ['ti', 'Tigrinya'], ['ts', 'Tsonga'], ['tn', 'Tswana'],
  ['tr', 'Turkish'], ['tk', 'Turkmen'], ['ak', 'Twi'], ['uk', 'Ukrainian'], ['ur', 'Urdu'],
  ['ug', 'Uyghur'], ['uz', 'Uzbek'], ['vi', 'Vietnamese'], ['cy', 'Welsh'], ['xh', 'Xhosa'],
  ['yi', 'Yiddish'], ['yo', 'Yoruba'], ['yua', 'Yucatec Maya'], ['zu', 'Zulu'],
];

// The codes Google also answers to, folded onto the one the site stores, so a
// reader who arrives with "tl" or "iw" from an old link is not refused.
const aliases = {
  tl: 'fil',
  iw: 'he',
  jv: 'jw',
  zh: 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  pt_BR: 'pt',
  pt_PT: 'pt',
  fr_CA: 'fr',
  fr_FR: 'fr',
  'ms-Arab': 'ms',
  'pa-Arab': 'pa',
};

const SUPPORTED = new Map(languages.map(([code, name]) => [code.toLowerCase(), { code, name }]));

/** The one spelling this site stores for a code, or null when it is unknown. */
function normalize(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim().replace(/_/g, '-');
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  const direct = SUPPORTED.get(lower);
  if (direct) return direct.code;
  // "es-MX", "sr-Cyrl" and friends: the base language is what matters here.
  const base = lower.split('-')[0];
  if (aliases[base]) return aliases[base];
  return SUPPORTED.get(base) ? SUPPORTED.get(base).code : null;
}

function isSupported(value) {
  return normalize(value) !== null;
}

function list() {
  return languages.map(([code, name]) => ({ code, name }));
}

module.exports = { list, normalize, isSupported, default: 'en' };
