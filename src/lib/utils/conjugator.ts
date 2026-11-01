import * as wanakana from 'wanakana';
import { toRomajiText, stripRubyTags } from './japanese';

export type VerbGroupId = 'godan' | 'ichidan' | 'suru' | 'kuru';

export interface VerbGroupInfo {
  id: VerbGroupId;
  label: string; // 'Grupo 1 (en -u)', 'Grupo 2 (en -ru)', 'Grupo 3 (Irregular)'
  badge: string; // 'Godan • 五段', 'Ichidan • 一段', 'Suru • する', 'Kuru • 来る'
  description: string;
}

export interface ConjugationItem {
  id: string;
  name: string; // e.g. "Formal presente"
  badge: string; // e.g. "-masu"
  kanji: string; // e.g. "食べます"
  reading: string; // e.g. "たべます"
  romaji: string; // e.g. "tabemasu"
  explanation: string; // e.g. "Cortesía estándar para presente y futuro"
}

export interface VerbConjugationResult {
  group: VerbGroupInfo;
  dictionaryKanji: string;
  dictionaryReading: string;
  dictionaryRomaji: string;
  conjugations: ConjugationItem[];
}

// Lista curada de verbos Godan que terminan en -iru / -eru (excepciones clásicas)
const GODAN_EXCEPTIONS_RU = new Set([
  '帰る', 'かえる',
  '入る', 'はいる',
  '走る', 'はしる',
  '知る', 'しる',
  '切る', 'きる',
  '要る', 'いる',
  '減る', 'へる',
  '喋る', 'しゃべる',
  '蹴る', 'ける',
  '滑る', 'すべる',
  '握る', 'にぎる',
  '限る', 'かぎる'
]);

/**
 * Determina si una palabra es un verbo analizando su part_of_speech o su morfología.
 */
export function isVerb(partOfSpeech: string | null | undefined, word?: string): boolean {
  if (partOfSpeech) {
    const pos = partOfSpeech.toLowerCase();
    if (
      pos.includes('verb') ||
      pos.includes('v1') ||
      pos.includes('v5') ||
      pos.includes('suru') ||
      pos.includes('kuru')
    ) {
      return true;
    }
  }

  if (word) {
    const clean = stripRubyTags(word).trim();
    if (clean.endsWith('する') || clean === 'くる' || clean === '来る') {
      return true;
    }
  }

  return false;
}

/**
 * Detecta a qué grupo pertenece el verbo:
 * - Grupo 1 (en -u) / Godan
 * - Grupo 2 (en -ru) / Ichidan
 * - Grupo 3 (Irregular) / Suru o Kuru
 */
export function getVerbGroup(
  partOfSpeech: string | null | undefined,
  word: string,
  reading?: string
): VerbGroupInfo {
  const pos = (partOfSpeech || '').toLowerCase();
  const cleanWord = stripRubyTags(word).trim();
  const cleanReading = stripRubyTags(reading || cleanWord).trim();

  // 1. Verbos Irregulares (Grupo 3)
  if (
    pos.includes('suru') ||
    cleanWord.endsWith('する') ||
    cleanReading.endsWith('する')
  ) {
    return {
      id: 'suru',
      label: 'Grupo 3 (Irregular)',
      badge: 'Suru • する',
      description: 'Verbo irregular que se conjuga transformando "suru" en shi- / sa-.'
    };
  }

  if (
    pos.includes('kuru') ||
    cleanWord === '来る' ||
    cleanReading === 'くる' ||
    cleanWord.endsWith('くる') ||
    cleanWord.endsWith('来る')
  ) {
    return {
      id: 'kuru',
      label: 'Grupo 3 (Irregular)',
      badge: 'Kuru • 来る',
      description: 'Verbo irregular de cambio de raíz (kuru / kimasu / konai).'
    };
  }

  // 2. Si el part_of_speech ya lo especifica explícitamente desde la base de datos
  if (pos.includes('ichidan') || pos.includes('v1')) {
    return {
      id: 'ichidan',
      label: 'Grupo 2 (en -ru)',
      badge: 'Ichidan • 一段',
      description: 'Raíz fija: sólo se quita la "ru" final para agregar las terminaciones.'
    };
  }

  if (pos.includes('godan') || pos.includes('v5')) {
    return {
      id: 'godan',
      label: 'Grupo 1 (en -u)',
      badge: 'Godan • 五段',
      description: 'Raíz móvil: la vocal final cambia por las 5 filas (a, i, u, e, o).'
    };
  }

  // 3. Heurística morfológica si part_of_speech sólo dice "verb"
  if (!cleanReading.endsWith('る')) {
    // Si no termina en 'る', es obligatoriamente Godan (Grupo 1)
    return {
      id: 'godan',
      label: 'Grupo 1 (en -u)',
      badge: 'Godan • 五段',
      description: 'Raíz móvil: la vocal final cambia por las 5 filas (a, i, u, e, o).'
    };
  }

  // Termina en 'る'. Analizamos la sílaba previa en kana
  if (GODAN_EXCEPTIONS_RU.has(cleanWord) || GODAN_EXCEPTIONS_RU.has(cleanReading)) {
    return {
      id: 'godan',
      label: 'Grupo 1 (en -u)',
      badge: 'Godan • 五段',
      description: 'Raíz móvil: la vocal final cambia por las 5 filas (a, i, u, e, o).'
    };
  }

  // Si la vocal previa a 'る' es 'i' o 'e', normalmente es Ichidan
  if (cleanReading.length >= 2) {
    const prevChar = cleanReading[cleanReading.length - 2];
    const prevRomaji = toRomajiText(prevChar);
    const lastVowel = prevRomaji.slice(-1).toLowerCase();
    if (lastVowel === 'i' || lastVowel === 'e') {
      return {
        id: 'ichidan',
        label: 'Grupo 2 (en -ru)',
        badge: 'Ichidan • 一段',
        description: 'Raíz fija: sólo se quita la "ru" final para agregar las terminaciones.'
      };
    }
  }

  return {
    id: 'godan',
    label: 'Grupo 1 (en -u)',
    badge: 'Godan • 五段',
    description: 'Raíz móvil: la vocal final cambia por las 5 filas (a, i, u, e, o).'
  };
}

/**
 * Tabla de conjugación para verbos Godan según la consonante terminal.
 */
interface GodanMapEntry {
  a: string;
  i: string;
  u: string;
  e: string;
  o: string;
  te: string;
  ta: string;
}

const GODAN_TABLE: Record<string, GodanMapEntry> = {
  'う': { a: 'わ', i: 'い', u: 'う', e: 'え', o: 'おう', te: 'って', ta: 'った' },
  'く': { a: 'か', i: 'き', u: 'く', e: 'け', o: 'こう', te: 'いて', ta: 'いた' },
  'ぐ': { a: 'が', i: 'ぎ', u: 'ぐ', e: 'げ', o: 'ごう', te: 'いで', ta: 'いだ' },
  'す': { a: 'さ', i: 'し', u: 'す', e: 'せ', o: 'そう', te: 'して', ta: 'した' },
  'つ': { a: 'た', i: 'ち', u: 'つ', e: 'て', o: 'とう', te: 'って', ta: 'った' },
  'ぬ': { a: 'な', i: 'に', u: 'ぬ', e: 'ね', o: 'のう', te: 'んで', ta: 'んだ' },
  'ぶ': { a: 'ば', i: 'び', u: 'ぶ', e: 'べ', o: 'ぼう', te: 'んで', ta: 'んだ' },
  'む': { a: 'ま', i: 'み', u: 'む', e: 'め', o: 'もう', te: 'んで', ta: 'んだ' },
  'る': { a: 'ら', i: 'り', u: 'る', e: 'れ', o: 'ろう', te: 'って', ta: 'った' },
};

/**
 * Genera la lista completa de conjugaciones para un verbo japonés.
 */
export function conjugateVerb(params: {
  kanji: string | null;
  reading: string;
  part_of_speech: string;
}): VerbConjugationResult | null {
  const { kanji, reading, part_of_speech } = params;
  const cleanKanji = kanji ? stripRubyTags(kanji).trim() : null;
  const cleanReading = stripRubyTags(reading).trim();
  const baseWord = cleanKanji || cleanReading;

  if (!isVerb(part_of_speech, baseWord)) {
    return null;
  }

  const group = getVerbGroup(part_of_speech, baseWord, cleanReading);
  const dictKanji = baseWord;
  const dictReading = cleanReading;
  const dictRomaji = toRomajiText(cleanReading);

  const conjugations: ConjugationItem[] = [];

  const add = (
    id: string,
    name: string,
    badge: string,
    k: string,
    r: string,
    explanation: string
  ) => {
    conjugations.push({
      id,
      name,
      badge,
      kanji: k,
      reading: r,
      romaji: toRomajiText(r),
      explanation
    });
  };

  // 1. Forma Diccionario (Presente informal)
  add(
    'dictionary',
    'Presente informal (Diccionario)',
    'Forma base',
    dictKanji,
    dictReading,
    'Forma neutra cotidiana para presente y futuro'
  );

  // ==========================================
  // GRUPO 2: ICHIDAN (en -ru)
  // ==========================================
  if (group.id === 'ichidan') {
    const readingStem = cleanReading.slice(0, -1);
    const kanjiStem = cleanKanji ? cleanKanji.slice(0, -1) : readingStem;

    add('masu', 'Presente formal', '-masu', `${kanjiStem}ます`, `${readingStem}ます`, 'Cortesía formal para presente y futuro');
    add('mashita', 'Pasado formal', '-mashita', `${kanjiStem}ました`, `${readingStem}ました`, 'Acción completada en modo formal');
    add('masen', 'Negativo formal', '-masen', `${kanjiStem}ません`, `${readingStem}ません`, 'Negación en modo formal');
    add('masen_deshita', 'Pasado negativo formal', '-masen deshita', `${kanjiStem}ませんでした`, `${readingStem}ませんでした`, 'Negación en pasado formal');
    add('te', 'Forma て (Te)', '-te', `${kanjiStem}て`, `${readingStem}て`, 'Conectar acciones, peticiones con ください o acción continua con いる');
    add('ta', 'Pasado informal', '-ta', `${kanjiStem}た`, `${readingStem}た`, 'Acción completada en estilo casual o coloquial');
    add('nai', 'Negativo informal', '-nai', `${kanjiStem}ない`, `${readingStem}ない`, 'Negación cotidiana o estilo casual');
    add('nakatta', 'Pasado negativo informal', '-nakatta', `${kanjiStem}なかった`, `${readingStem}なかった`, 'Negación en pasado informal');
    add('potential', 'Potencial (Poder hacer)', '-rareru', `${kanjiStem}られる`, `${readingStem}られる`, 'Capacidad o posibilidad de realizar la acción');
    add('volitional', 'Volitiva (Hagamos)', '-you', `${kanjiStem}よう`, `${readingStem}よう`, 'Invitación o intención ("¡Vamos a...!")');
    add('conditional', 'Condicional (-ba)', '-reba', `${kanjiStem}れば`, `${readingStem}れば`, 'Expresa condición ("Si...")');
    add('imperative', 'Imperativo (Orden)', '-ro', `${kanjiStem}ろ`, `${readingStem}ろ`, 'Orden directa tajante');
  }

  // ==========================================
  // GRUPO 1: GODAN (en -u)
  // ==========================================
  else if (group.id === 'godan') {
    const lastCharReading = cleanReading.slice(-1);
    const readingStem = cleanReading.slice(0, -1);
    const map = GODAN_TABLE[lastCharReading] || {
      a: 'わ', i: 'い', u: 'う', e: 'え', o: 'おう', te: 'って', ta: 'った'
    };

    const kanjiStem = cleanKanji ? cleanKanji.slice(0, -1) : readingStem;

    // Caso especial: 行く / いく (te/ta irregular: 行って / 行った)
    const isIku = baseWord === '行く' || baseWord === 'いく' || cleanReading === 'いく';
    const teSuffix = isIku ? 'って' : map.te;
    const taSuffix = isIku ? 'った' : map.ta;

    // Caso especial: ある (negativo es ない / ありません / なかった)
    const isAru = baseWord === 'ある' || cleanReading === 'ある';
    const naiForm = isAru ? 'ない' : `${readingStem}${map.a}ない`;
    const naiKanji = isAru ? 'ない' : `${kanjiStem}${map.a}ない`;
    const nakattaForm = isAru ? 'なかった' : `${readingStem}${map.a}なかった`;
    const nakattaKanji = isAru ? 'なかった' : `${kanjiStem}${map.a}なかった`;

    add('masu', 'Presente formal', '-masu', `${kanjiStem}${map.i}ます`, `${readingStem}${map.i}ます`, 'Cortesía formal para presente y futuro');
    add('mashita', 'Pasado formal', '-mashita', `${kanjiStem}${map.i}ました`, `${readingStem}${map.i}ました`, 'Acción completada en modo formal');
    add('masen', 'Negativo formal', '-masen', isAru ? 'ありません' : `${kanjiStem}${map.i}ません`, isAru ? 'ありません' : `${readingStem}${map.i}ません`, 'Negación en modo formal');
    add('masen_deshita', 'Pasado negativo formal', '-masen deshita', isAru ? 'ありませんでした' : `${kanjiStem}${map.i}ませんでした`, isAru ? 'ありませんでした' : `${readingStem}${map.i}ませんでした`, 'Negación en pasado formal');
    add('te', 'Forma て (Te)', '-te / -de', `${kanjiStem}${teSuffix}`, `${readingStem}${teSuffix}`, 'Conectar acciones, peticiones con ください o continuo');
    add('ta', 'Pasado informal', '-ta / -da', `${kanjiStem}${taSuffix}`, `${readingStem}${taSuffix}`, 'Acción completada en estilo casual');
    add('nai', 'Negativo informal', '-nai', naiKanji, naiForm, 'Negación cotidiana o estilo casual');
    add('nakatta', 'Pasado negativo informal', '-nakatta', nakattaKanji, nakattaForm, 'Negación en pasado informal');
    add('potential', 'Potencial (Poder hacer)', '-eru', `${kanjiStem}${map.e}る`, `${readingStem}${map.e}る`, 'Capacidad o posibilidad de realizar la acción');
    add('volitional', 'Volitiva (Hagamos)', '-ou', `${kanjiStem}${map.o}`, `${readingStem}${map.o}`, 'Invitación o intención ("¡Vamos a...!")');
    add('conditional', 'Condicional (-ba)', '-eba', `${kanjiStem}${map.e}ば`, `${readingStem}${map.e}ば`, 'Expresa condición ("Si...")');
    add('imperative', 'Imperativo (Orden)', '-e', `${kanjiStem}${map.e}`, `${readingStem}${map.e}`, 'Orden directa tajante');
  }

  // ==========================================
  // GRUPO 3: SURU (Irregular)
  // ==========================================
  else if (group.id === 'suru') {
    const isSingleSuru = cleanReading === 'する';
    const readingPrefix = isSingleSuru ? '' : cleanReading.replace(/する$/, '');
    const kanjiPrefix = cleanKanji
      ? cleanKanji.replace(/する$/, '')
      : readingPrefix;

    add('masu', 'Presente formal', '-shimasu', `${kanjiPrefix}します`, `${readingPrefix}します`, 'Cortesía formal para presente y futuro');
    add('mashita', 'Pasado formal', '-shimashita', `${kanjiPrefix}しました`, `${readingPrefix}しました`, 'Acción completada en modo formal');
    add('masen', 'Negativo formal', '-shimasen', `${kanjiPrefix}しません`, `${readingPrefix}しません`, 'Negación en modo formal');
    add('masen_deshita', 'Pasado negativo formal', '-shimasen deshita', `${kanjiPrefix}しませんでした`, `${readingPrefix}しませんでした`, 'Negación en pasado formal');
    add('te', 'Forma て (Te)', '-shite', `${kanjiPrefix}して`, `${readingPrefix}して`, 'Conectar acciones o peticiones');
    add('ta', 'Pasado informal', '-shita', `${kanjiPrefix}した`, `${readingPrefix}した`, 'Acción completada en estilo casual');
    add('nai', 'Negativo informal', '-shinai', `${kanjiPrefix}しない`, `${readingPrefix}しない`, 'Negación cotidiana casual');
    add('nakatta', 'Pasado negativo informal', '-shinakatta', `${kanjiPrefix}しなかった`, `${readingPrefix}しなかった`, 'Negación en pasado informal');
    add('potential', 'Potencial (Poder hacer)', '-dekiru', `${kanjiPrefix}できる`, `${readingPrefix}できる`, 'Capacidad de realizar la acción');
    add('volitional', 'Volitiva (Hagamos)', '-shiyou', `${kanjiPrefix}しよう`, `${readingPrefix}しよう`, 'Invitación o intención');
    add('conditional', 'Condicional (-ba)', '-sureba', `${kanjiPrefix}すれば`, `${readingPrefix}すれば`, 'Expresa condición ("Si...")');
    add('imperative', 'Imperativo (Orden)', '-shiro', `${kanjiPrefix}しろ`, `${readingPrefix}しろ`, 'Orden directa');
  }

  // ==========================================
  // GRUPO 3: KURU (Irregular)
  // ==========================================
  else if (group.id === 'kuru') {
    const hasKanji = cleanKanji && cleanKanji.includes('来');
    const kPrefix = hasKanji ? cleanKanji.replace(/来る$/, '') : '';
    const rPrefix = cleanReading.replace(/くる$/, '');

    const makeK = (kChar: string, okuri: string) => hasKanji ? `${kPrefix}${kChar}${okuri}` : `${rPrefix}${okuri}`;

    add('masu', 'Presente formal', 'kimasu', makeK('来', 'ます'), `${rPrefix}きます`, 'Cortesía formal para presente y futuro');
    add('mashita', 'Pasado formal', 'kimashita', makeK('来', 'ました'), `${rPrefix}きました`, 'Acción completada en modo formal');
    add('masen', 'Negativo formal', 'kimasen', makeK('来', 'ません'), `${rPrefix}きません`, 'Negación en modo formal');
    add('masen_deshita', 'Pasado negativo formal', 'kimasen deshita', makeK('来', 'ませんでした'), `${rPrefix}きませんでした`, 'Negación en pasado formal');
    add('te', 'Forma て (Te)', 'kite', makeK('来', 'て'), `${rPrefix}きて`, 'Conectar acciones o peticiones ("¡Ven!")');
    add('ta', 'Pasado informal', 'kita', makeK('来', 'た'), `${rPrefix}きた`, 'Acción completada ("Vino / Vine")');
    add('nai', 'Negativo informal', 'konai', makeK('来', 'ない'), `${rPrefix}こない`, 'Negación casual ("No viene")');
    add('nakatta', 'Pasado negativo informal', 'konakatta', makeK('来', 'なかった'), `${rPrefix}こなかった`, 'Negación en pasado informal');
    add('potential', 'Potencial (Poder venir)', 'korareru', makeK('来', 'られる'), `${rPrefix}こられる`, 'Poder venir');
    add('volitional', 'Volitiva (Vengamos)', 'koyou', makeK('来', 'よう'), `${rPrefix}こよう`, 'Intención de venir');
    add('conditional', 'Condicional (-ba)', 'kureba', makeK('来', 'れば'), `${rPrefix}くれば`, 'Si viene');
    add('imperative', 'Imperativo (¡Ven!)', 'koi', makeK('来', 'い'), `${rPrefix}こい`, 'Orden tajante');
  }

  return {
    group,
    dictionaryKanji: dictKanji,
    dictionaryReading: dictReading,
    dictionaryRomaji: dictRomaji,
    conjugations
  };
}

/**
 * Desconjuga una búsqueda para encontrar la forma diccionario (Búsqueda Inversa).
 * Ej. "tabemasu" o "食べました" -> ["食べる", "たべる"]
 *     "nomimasu" -> ["飲む", "のむ"]
 */
export function getDeconjugatedCandidates(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return [];

  const candidates = new Set<string>();

  // Analizamos tanto la consulta directa como su conversión a hiragana
  const hira = wanakana.toHiragana(trimmed);
  const formsToTest = Array.from(new Set([trimmed, hira]));

  // Reglas de desconjugación sobre sufijos habituales
  for (const str of formsToTest) {
    // 1. -masu / -ました / -ません / -ます
    if (str.endsWith('ました') || str.endsWith('ません') || str.endsWith('ます')) {
      const suffixLen = (str.endsWith('ました') || str.endsWith('ません')) ? 3 : 2;
      const stem = str.slice(0, -suffixLen);
      // Ichidan
      candidates.add(`${stem}る`);
      // Godan (i -> u)
      const last = stem.slice(-1);
      const godanStem = stem.slice(0, -1);
      const iToU: Record<string, string> = {
        'い': 'う', 'き': 'く', 'ぎ': 'ぐ', 'し': 'す', 'ち': 'つ',
        'に': 'ぬ', 'び': 'ぶ', 'み': 'む', 'り': 'る'
      };
      if (iToU[last]) {
        candidates.add(`${godanStem}${iToU[last]}`);
      }
      if (stem === 'し' || stem.endsWith('し')) {
        candidates.add(stem.replace(/し$/, 'する'));
      }
      if (stem === 'き' || stem.endsWith('き')) {
        candidates.add(stem.replace(/き$/, 'くる'));
      }
    }

    // 2. -nai / -ない
    if (str.endsWith('ない')) {
      const stem = str.slice(0, -2);
      // Ichidan
      candidates.add(`${stem}る`);
      // Godan (a -> u)
      const last = stem.slice(-1);
      const godanStem = stem.slice(0, -1);
      const aToU: Record<string, string> = {
        'わ': 'う', 'か': 'く', 'が': 'ぐ', 'さ': 'す', 'た': 'つ',
        'な': 'ぬ', 'ば': 'ぶ', 'ま': 'む', 'ら': 'る'
      };
      if (aToU[last]) {
        candidates.add(`${godanStem}${aToU[last]}`);
      }
      if (stem === 'し' || stem.endsWith('し')) {
        candidates.add(stem.replace(/し$/, 'する'));
      }
      if (stem === 'こ' || stem.endsWith('こ')) {
        candidates.add(stem.replace(/こ$/, 'くる'));
      }
    }

    // 3. -te / -て / -で
    if (str.endsWith('て') || str.endsWith('で')) {
      const stem = str.slice(0, -1);
      // Ichidan
      candidates.add(`${stem}る`);
      // Godan
      if (str.endsWith('って')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}う`);
        candidates.add(`${pre}つ`);
        candidates.add(`${pre}る`);
      } else if (str.endsWith('いて')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}く`);
      } else if (str.endsWith('いで')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}ぐ`);
      } else if (str.endsWith('んで')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}む`);
        candidates.add(`${pre}ぶ`);
        candidates.add(`${pre}ぬ`);
      } else if (str.endsWith('して')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}す`);
        candidates.add(`${pre}する`);
      }
    }

    // 4. -ta / -た / -だ
    if (str.endsWith('た') || str.endsWith('だ')) {
      const stem = str.slice(0, -1);
      // Ichidan
      candidates.add(`${stem}る`);
      // Godan
      if (str.endsWith('った')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}う`);
        candidates.add(`${pre}つ`);
        candidates.add(`${pre}る`);
      } else if (str.endsWith('いた')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}く`);
      } else if (str.endsWith('いだ')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}ぐ`);
      } else if (str.endsWith('んだ')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}む`);
        candidates.add(`${pre}ぶ`);
        candidates.add(`${pre}ぬ`);
      } else if (str.endsWith('した')) {
        const pre = str.slice(0, -2);
        candidates.add(`${pre}す`);
        candidates.add(`${pre}する`);
      }
    }
  }

  return Array.from(candidates).filter((c) => c.length >= 2);
}
