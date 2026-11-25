// Revisione della mappa dell'URSS (25/11/2026): nomi del 1936 al posto di quelli attuali di Natural Earth, Bajkonur tolto
// da Kzyl-Orda, bacini artificiali del dopoguerra segnati con l'anno di riempimento (il disegno li nasconde).
//
//   node scripts/revisione-urss-1936.js
//
// Idempotente: il nome di partenza resta in `nameNe` e si riparte sempre da quello.
// I confini restano quelli attuali (oblast di oggi, `suddivisione_moderna_non_1936`): qui cambiano solo i nomi.
// Nomi: `name` = nome italiano o traslitterazione scientifica, come le città (Charkov, Voronež, Stalingrado);
// `nameLocal` = nome del 1936 nella lingua della repubblica, in alfabeto latino (è quello scritto sulla mappa).
// Fonte: conoscenza storica (rinomine di città e regioni 1924-1939), da verificare; nessun nome è `verified`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readProvinceDocs, writeProvinceDocs } from './province-io.js';

/** id senza _SPn -> [name, nameLocal] (solo dove il nome di Natural Earth è attuale, inglese o con note fra parentesi). */
export const NOMI_1936 = {
  // RSFSR
  LENINGRAD: ['Leningrado', 'Leningrad'], KARELIA: ['Carelia', 'Kareliya'], ARKHANGELSK: ['Arcangelo', 'Arkhangelsk'],
  NENETS: ['Nenezia', 'Nenetskiy okrug'], KIROV: ['Kirov', 'Kirov'], KALMYK: ['Calmucchia', 'Kalmykiya'],
  BASHKORTOSTAN: ['Baschiria', 'Bashkiriya'], TATARSTAN: ['Tataria', 'Tatariya'], UDMURT: ['Udmurtia', 'Udmurtiya'],
  PERM: ["Perm'", 'Perm'], VORONEZH: ['Voronež', 'Voronezh'], BRYANSK: ['Brjansk', 'Bryansk'], OREL: ['Orël', 'Oryol'],
  BURYAT: ['Buriato-Mongolia', 'Buryat-Mongoliya'], TUVA: ['Tannu Tuva', 'Tannu-Tuva'], STAVROPOL: ['Vorošilovsk', 'Voroshilovsk'],
  CHUKCHI_AUTONOMOUS_OKRUG: ['Čukotka', 'Chukotka'], KAMCHATKA: ['Kamčatka', 'Kamchatka'], MAGA_BURYATDAN: ['Kolyma', 'Kolyma'],
  CHUVASH: ['Ciuvascia', 'Chuvashiya'], ULYANOVSK: ["Ul'janovsk", 'Ulyanovsk'], MORDOVIA: ['Mordovia', 'Mordoviya'],
  NIZHEGOROD: ["Gor'kij", 'Gorkiy'], MARIY_EL: ['Mari', 'Mariy'], CRIMEA: ['Crimea', 'Krym'], KHAKASS: ['Chakassia', 'Khakasiya'],
  KRASNOYARSK: ['Krasnojarsk', 'Krasnoyarsk'], YAROSLAVL: ["Jaroslavl'", 'Yaroslavl'], MOSKOVSKAYA: ['Mosca', 'Moskva'],
  PRIMORYE: ["Primor'e", 'Primorye'], KHANTY_MANSIY: ['Ostiaco-Vogulia', 'Ostyako-Vogulsk'], YAMAL_NENETS: ['Jamalia', 'Yamal'],
  LIPETSK: ['Lipeck', 'Lipetsk'], RYAZAN: ["Rjazan'", 'Ryazan'], TVER: ['Kalinin', 'Kalinin'], SAMARA: ['Kujbyšev', 'Kuybyshev'],
  SAKHALIN: ['Sachalin', 'Sakhalin'], TYUMEN: ["Tjumen'", 'Tyumen'], CHELYABINSK: ['Čeljabinsk', 'Chelyabinsk'],
  ALTAY: ['Altaj', 'Altay'], GORNO_ALTAY: ['Ojrotia', 'Oyrotiya'], CHITA: ['Čita', 'Chita'], SAKHA_YAKUTIA: ['Jacuzia', 'Yakutiya'],
  KHABAROVSK: ['Chabarovsk', 'Khabarovsk'], YEVREY: ['Birobidžan', 'Birobidzhan'], ASTRAKHAN: ["Astrachan'", 'Astrakhan'],
  VOLGOGRAD: ['Stalingrado', 'Stalingrad'], ADYGEY: ['Adighezia', 'Adygeya'], KARACHAY_CHERKESS: ['Karačaj-Circassia', 'Karachay-Cherkesiya'],
  KABARDIN_BALKAR: ['Cabardino-Balcaria', 'Kabardino-Balkariya'], NORTH_OSSETIA: ['Ossezia del Nord', 'Severnaya Osetiya'],
  INGUSH: ['Inguscezia', 'Ingushetiya'], CHECHNYA: ['Cecenia', 'Chechnya'], DAGESTAN: ['Daghestan', 'Dagestan'],
  // Ucraina (nome locale ucraino), Bielorussia, Moldavia
  KHARKIV: ['Charkov', 'Kharkiv'], CHERNIHIV: ['Černigov', 'Chernihiv'], LUHANSK: ['Vorošilovgrad', 'Voroshylovhrad'],
  DONETSK: ['Stalino', 'Stalino'], KIEV: ['Kiev', 'Kyiv'], KIROVOHRAD: ['Kirovo', 'Kirove'], CHERKASY: ['Čerkassy', 'Cherkasy'],
  DNIPROPETROVSK: ['Dnepropetrovsk', 'Dnipropetrovsk'], ZAPORIZHZHYA: ["Zaporož'e", 'Zaporizhzhia'], MYKOLAYIV: ['Nikolaev', 'Mykolaiv'],
  KHMELNYTSKYY: ['Proskurov', 'Proskuriv'], VINNYTSYA: ['Vinnica', 'Vinnytsia'], ZHYTOMYR: ['Žitomir', 'Zhytomyr'],
  KHERSON: ['Cherson', 'Kherson'], ODESSA: ['Odessa', 'Odesa'], MOLDAVIAN_ASSR: ['Moldavia (RSSA)', 'Moldova'],
  GOMEL: ["Gomel'", 'Homel'], MOGILEV: ['Mogilëv', 'Mahilyow'],
  // Kazakistan (nome locale kazako)
  ALMATY: ['Alma-Ata', 'Almaty'], EAST_KAZAKHSTAN: ['Kazakistan Orientale', 'Shyghys Qazaqstan'], QARAGHANDY: ['Karaganda', 'Qaraghandy'],
  ZHAMBYL: ['Aulie-Ata', 'Äulie-Ata'], AQMOLA: ['Akmolinsk', 'Aqmola'], NORTH_KAZAKHSTAN: ['Kazakistan Settentrionale', 'Soltüstik Qazaqstan'],
  QOSTANAY: ['Kustanaj', 'Qostanay'], AQTOBE: ['Aktjubinsk', 'Aqtöbe'], MANGGHYSTAU: ['Mangyšlak', 'Mangghystau'],
  ATYRAU: ["Gur'ev", 'Guryev'], WEST_KAZAKHSTAN: ['Kazakistan Occidentale', 'Batys Qazaqstan'], QYZYLORDA: ['Kzyl-Orda', 'Qyzylorda'],
  SOUTH_KAZAKHSTAN: ['Kazakistan Meridionale', 'Ongtüstik Qazaqstan'],
  // Uzbekistan, Kirghizistan, Tagikistan, Turkmenistan
  KARAKALPAKSTAN: ['Karakalpakia', 'Qoraqalpogʻiston'], NAVOI: ['Kermine', 'Karmana'], TASHKENT: ['Taškent', 'Toshkent'],
  SIRDARYO: ["Syr-Dar'ja", 'Sirdaryo'], JIZZAKH: ['Džizak', 'Jizzax'], FERGHANA: ['Fergana', 'Fargʻona'], ANDIJON: ['Andižan', 'Andijon'],
  KHOREZM: ['Chorezm', 'Xorazm'], BUKHORO: ['Buchara', 'Buxoro'], SAMARKAND: ['Samarcanda', 'Samarqand'],
  KASHKADARYA: ["Kaškadar'ja", 'Qashqadaryo'], SURKHANDARYA: ["Surchandar'ja", 'Surxondaryo'],
  CHUY: ['Frunze', 'Frunze'], YSYK_KOL: ["Issyk-Kul'", 'Ysyk-Köl'], JALAL_ABAD: ['Džalal-Abad', 'Jalal-Abad'],
  TADZHIKISTAN_TERRITORIES: ['Stalinabad', 'Stalinobod'], LENINABAD: ['Leninabad', 'Leninobod'], KHATLON: ['Kurgan-Tjube', 'Qurghonteppa'],
  GORNO_BADAKHSHAN: ['Gorno-Badachšan', 'Badakhshoni Kuhi'],
  AHAL: ['Achal', 'Ahal'], BALKAN: ['Krasnovodsk', 'Krasnowodsk'], MARY: ['Merv', 'Merw'], CHARDZHOU: ['Čardžou', 'Chärjew'], TASHAUZ: ['Tašauz', 'Dashhowuz'],
  // Transcaucasia
  ABSHERON: ['Baku', 'Bakı'], GUBA_KHACHMAZ: ['Kuba', 'Quba'], DAGHLIG_SHIRVAN: ['Šemacha', 'Şamaxı'], LANKARAN: ["Lenkoran'", 'Lənkəran'],
  SHAKI_ZAQATALA: ['Nucha-Zakataly', 'Nukha-Zaqatala'], GANJA_GAZAKH: ['Kirovabad', 'Kirovabad'], YUKHARI_GARABAKH: ['Nagorno-Karabach', 'Dağlıq Qarabağ'],
  KALBAJAR_LACHIN: ['Lačin', 'Laçın'], NAKHCHIVAN: ["Nachičevan'", 'Naxçıvan'], SHIRAK: ['Leninakan', 'Leninakan'], SYUNIK: ['Zangezur', 'Zangezur'],
  GEGHARKUNIK: ['Sevan', 'Sevan'], AJARIA: ['Agiaria', 'Achara'], ABKHAZIA: ['Abcasia', 'Apkhazeti'], IMERETI: ['Imerezia', 'Imereti'],
  KAKHETI: ['Cachezia', 'Kakheti'], SAMEGRELO_ZEMO_SVANETI: ['Mingrelia', 'Samegrelo'], SAMTSKHE_JAVAKHETI: ['Meschezia', 'Samtskhe-Javakheti'],
  MTSKHETA_MTIANETI: ['Mccheta-Mtianeti', 'Mtskheta-Mtianeti'], RACHA_LECHKHUMI_KVEMO_SVANETI: ['Racia-Lečchumi', 'Racha-Lechkhumi'],
  SHIDA_KARTLI: ['Cartalinia Interna', 'Shida Kartli'], KVEMO_KARTLI: ['Cartalinia Inferiore', 'Kvemo Kartli'],
};

/** Bacini artificiali riempiti dopo il 1° gennaio 1936: id lago -> anno (primo riempimento, circa). Il disegno li nasconde. */
export const BACINI_DOPO_1936 = {
  L_IVANKOVO: 1937, L_UGLICH: 1939, L_RYBINSK: 1941, L_VESELOVSKY: 1941, L_TSIMLYANSK: 1952, L_MINGACHEVIR: 1953, L_KAMA: 1954,
  L_GORKY: 1955, L_KAKHOVKA: 1955, L_KUYBYSHEV: 1955, L_KOSTROMA: 1956, L_KAYRAKKUM: 1956, L_NOVOSIBIRSK: 1957, L_VOLGOGRAD: 1958,
  L_NONAME_131: 1958, // Iriklinskoe (Ural)
  L_KREMENCHUK: 1959, L_VOTKINSK: 1961, L_BRATSK: 1961, L_NONAME_336: 1962, // Pečenegi (Donec)
  L_SARYGAMYSH: 1962, // lago quasi asciutto prima delle acque di scolo dell'irrigazione
  L_SHEKSNA: 1963, L_NONAME_197: 1963, // Dneprodzeržinsk
  L_KYIV: 1964, L_CHARDARA_RESERVOIR: 1965, L_SARATOV: 1967, L_KRASNOYARSK: 1967, L_VILYUY: 1967, L_LOKKA: 1967, L_SEREBRYANSK: 1970,
  L_KAPCHAGAY: 1970, L_PORTTIPAHTA: 1970, L_KRASNODAR: 1973, L_TOKTOGUL: 1974, L_UST_ILIMSK: 1974, L_NONAME_138: 1974, // Kanev
  L_ZEYA: 1975, L_NIZHNEKAMSK: 1978, L_CHEBOKSARY: 1980, L_NONAME_335: 1984, // Krasnyj Oskol
};

const base = (id) => id.replace(/^P_USSR_/, '').replace(/_SP\d+$/, '');
const SUFFIX = / \(sponda [^)]+\)$/;

/** Kzyl-Orda: Natural Earth ha Bajkonur (città del 1955) come buco, riempito poi da un pezzo a griglia: due contorni concentrici. */
function chiudiBajkonur(f) {
  const g = f.geometry;
  if (g.type !== 'MultiPolygon') return false;
  const box = (r) => r.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.1);
  for (const poly of g.coordinates) {
    for (let h = 1; h < poly.length; h += 1) {
      const hb = box(poly[h]);
      const fill = g.coordinates.findIndex((q) => q !== poly && q.length === 1 && near(box(q[0]), hb));
      if (fill < 0) continue;
      poly.splice(h, 1);
      g.coordinates.splice(fill, 1);
      if (g.coordinates.length === 1) { f.geometry = { type: 'Polygon', coordinates: g.coordinates[0] }; }
      return true;
    }
  }
  return false;
}

export async function main() {
  const docs = await readProvinceDocs();
  const doc = docs.find((d) => d.name === 'USSR.json');
  let renamed = 0;
  for (const f of doc.data.features) {
    const p = f.properties;
    p.nameNe ??= [p.name, p.nameLocal];
    const [neName] = p.nameNe;
    const sfx = neName.match(SUFFIX)?.[0] ?? '';
    const nuovo = NOMI_1936[base(p.id)];
    // senza nome nuovo: si tolgono solo le note fra parentesi del nome locale ("(con Mosca)", "(Gorky 1932-90)")
    const [n, l] = nuovo ?? [neName.replace(SUFFIX, ''), neName.replace(SUFFIX, '')];
    const name = n + sfx;
    const nameLocal = l + sfx;
    if (p.name !== name || p.nameLocal !== nameLocal) renamed += 1;
    p.name = name;
    p.nameLocal = nameLocal;
    if (p.id === 'P_USSR_QYZYLORDA' && chiudiBajkonur(f)) {
      p.notes = `${p.notes} Bajkonur (città del 1955, enclave nei dati attuali) unito a Kzyl-Orda.`;
    }
  }
  doc.touched = true;
  await writeProvinceDocs(docs);

  const lakesUrl = new URL('../data/lakes.json', import.meta.url);
  const raw = await readFile(lakesUrl, 'utf8');
  const lakes = JSON.parse(raw);
  let marked = 0;
  for (const f of lakes.features) {
    const y = BACINI_DOPO_1936[f.properties.id];
    if (y) { f.properties.annoRiempimento = y; marked += 1; }
  }
  await writeFile(lakesUrl, JSON.stringify(lakes) + (raw.endsWith('\n') ? '\n' : ''));

  // i tratti di fiume dentro un bacino nascosto si disegnano (nel 1936 lì c'era il fiume); `inLake` resta com'è perché lo
  // usano i generatori (ponti e trasporti), che non cambiano qui
  const hidden = lakes.features.filter((f) => f.properties.annoRiempimento);
  const inRing = (x, y, r) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const lakeAt = (x, y) => hidden.find((f) => polysOf(f.geometry).some((poly) => poly.reduce((n, r) => n + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1));
  const riversUrl = new URL('../data/rivers_geo.json', import.meta.url);
  const rawR = await readFile(riversUrl, 'utf8');
  const rivers = JSON.parse(rawR);
  let freed = 0;
  for (const f of rivers.features) {
    if (!f.properties.inLake) continue;
    const c = f.geometry.coordinates;
    const [x, y] = c.length > 2 ? c[Math.floor(c.length / 2)] : [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2];
    const lake = lakeAt(x, y);
    if (lake) { f.properties.bacinoDopo1936 = lake.properties.id; freed += 1; } else delete f.properties.bacinoDopo1936;
  }
  await writeFile(riversUrl, JSON.stringify(rivers) + (rawR.endsWith('\n') ? '\n' : ''));
  console.log(`URSS: ${renamed} province rinominate; laghi segnati con l'anno di riempimento: ${marked}/${Object.keys(BACINI_DOPO_1936).length}; tratti di fiume ridisegnati nei bacini: ${freed}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
