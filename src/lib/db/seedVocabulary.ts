import type { VocabularyRecord } from './schema';

/**
 * Catálogo semilla offline-first replicado de oboeru_prod (JLPT N5, N4, N3 y Verbos).
 * Incluye soporte nativo para etiquetas HTML <ruby> en kanji/oraciones y datos limpios.
 */
export const INITIAL_VOCABULARY_SEED: VocabularyRecord[] = [
  {
    id: '11111111-1111-4111-8111-000000000001',
    kanji: '<ruby>覚<rt>おぼ</rt></ruby>える',
    reading: 'おぼえる',
    meaning_es: 'recordar; memorizar; aprender',
    meaning_en: 'to memorize; to learn; to remember',
    jlpt_level: 5,
    part_of_speech: 'verb (ichidan)',
    example_sentence: '<ruby>新<rt>あたら</rt></ruby>しい<ruby>漢字<rt>かんじ</rt></ruby>を<ruby>覚<rt>おぼ</rt></ruby>える。(Aprender nuevos kanjis.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000002',
    kanji: '<ruby>食<rt>た</rt></ruby>べる',
    reading: 'たべる',
    meaning_es: 'comer',
    meaning_en: 'to eat',
    jlpt_level: 5,
    part_of_speech: 'verb (ichidan)',
    example_sentence: '<ruby>朝<rt>あさ</rt></ruby>ごはんを<ruby>食<rt>た</rt></ruby>べる。(Comer el desayuno.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000003',
    kanji: '<ruby>飲<rt>の</rt></ruby>む',
    reading: 'のむ',
    meaning_es: 'beber; tomar',
    meaning_en: 'to drink; to swallow',
    jlpt_level: 5,
    part_of_speech: 'verb (godan)',
    example_sentence: '<ruby>毎朝<rt>まいあさ</rt></ruby>コーヒーを<ruby>飲<rt>の</rt></ruby>みます。(Tomo café todas las mañanas.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000004',
    kanji: '<ruby>行<rt>い</rt></ruby>く',
    reading: 'いく',
    meaning_es: 'ir',
    meaning_en: 'to go',
    jlpt_level: 5,
    part_of_speech: 'verb (godan)',
    example_sentence: '<ruby>明日<rt>あした</rt></ruby>、<ruby>東京<rt>とうきょう</rt></ruby>へ<ruby>行<rt>い</rt></ruby>きます。(Mañana voy a Tokio.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000005',
    kanji: '<ruby>見<rt>み</rt></ruby>る',
    reading: 'みる',
    meaning_es: 'ver; mirar; observar',
    meaning_en: 'to see; to look; to watch',
    jlpt_level: 5,
    part_of_speech: 'verb (ichidan)',
    example_sentence: '<ruby>日本<rt>にほん</rt></ruby>の<ruby>映画<rt>えいが</rt></ruby>を<ruby>見<rt>み</rt></ruby>ました。(Vi una película japonesa.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000006',
    kanji: '<ruby>読<rt>よ</rt></ruby>む',
    reading: 'よむ',
    meaning_es: 'leer',
    meaning_en: 'to read',
    jlpt_level: 5,
    part_of_speech: 'verb (godan)',
    example_sentence: '<ruby>本<rt>ほん</rt></ruby>を<ruby>読<rt>よ</rt></ruby>むのが<ruby>好<rt>す</rt></ruby>きです。(Me gusta leer libros.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000007',
    kanji: '<ruby>聞<rt>き</rt></ruby>く',
    reading: 'きく',
    meaning_es: 'escuchar; oír; preguntar',
    meaning_en: 'to hear; to listen; to ask',
    jlpt_level: 5,
    part_of_speech: 'verb (godan)',
    example_sentence: '<ruby>音楽<rt>おんがく</rt></ruby>を<ruby>聞<rt>き</rt></ruby>いています。(Estoy escuchando música.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000008',
    kanji: '<ruby>話<rt>はな</rt></ruby>す',
    reading: 'はなす',
    meaning_es: 'hablar; conversar',
    meaning_en: 'to speak; to talk',
    jlpt_level: 5,
    part_of_speech: 'verb (godan)',
    example_sentence: '<ruby>日本語<rt>にほんご</rt></ruby>を<ruby>少<rt>すこ</rt></ruby>し<ruby>話<rt>はな</rt></ruby>せます。(Puedo hablar un poco de japonés.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000009',
    kanji: '<ruby>買<rt>か</rt></ruby>う',
    reading: 'かう',
    meaning_es: 'comprar',
    meaning_en: 'to buy; to purchase',
    jlpt_level: 5,
    part_of_speech: 'verb (godan)',
    example_sentence: '<ruby>駅<rt>えき</rt></ruby>で<ruby>切符<rt>きっぷ</rt></ruby>を<ruby>買<rt>か</rt></ruby>いました。(Compré un boleto en la estación.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000010',
    kanji: null,
    reading: 'いつも',
    meaning_es: 'siempre; habitualmente',
    meaning_en: 'always; usually',
    jlpt_level: 5,
    part_of_speech: 'adverb',
    example_sentence: 'いつもありがとうございます。(Muchas gracias como siempre.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000011',
    kanji: null,
    reading: 'ゆっくり',
    meaning_es: 'despacio; lentamente; con calma',
    meaning_en: 'slowly; at ease',
    jlpt_level: 5,
    part_of_speech: 'adverb',
    example_sentence: 'もう<ruby>少<rt>すこ</rt></ruby>しゆっくり<ruby>話<rt>はな</rt></ruby>してください。(Por favor, hable un poco más despacio.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000012',
    kanji: '<ruby>先生<rt>せんせい</rt></ruby>',
    reading: 'せんせい',
    meaning_es: 'profesor; maestro; doctor',
    meaning_en: 'teacher; master; doctor',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>田中先生<rt>たなかせんせい</rt></ruby>はとても<ruby>親切<rt>しんせつ</rt></ruby>です。(El profesor Tanaka es muy amable.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000013',
    kanji: '<ruby>学生<rt>がくせい</rt></ruby>',
    reading: 'がくせい',
    meaning_es: 'estudiante',
    meaning_en: 'student',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>私<rt>わたし</rt></ruby>は<ruby>日本語<rt>にほんご</rt></ruby>の<ruby>学生<rt>がくせい</rt></ruby>です。(Soy estudiante de japonés.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000014',
    kanji: '<ruby>友達<rt>ともだち</rt></ruby>',
    reading: 'ともだち',
    meaning_es: 'amigo; amiga',
    meaning_en: 'friend; companion',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>週末<rt>しゅうまつ</rt></ruby>に<ruby>友達<rt>ともだち</rt></ruby>と<ruby>会<rt>あ</rt></ruby>います。(Me encontraré con mis amigos el fin de semana.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000015',
    kanji: '<ruby>時間<rt>じかん</rt></ruby>',
    reading: 'じかん',
    meaning_es: 'tiempo; hora',
    meaning_en: 'time; hour',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>今日<rt>きょう</rt></ruby>は<ruby>時間<rt>じかん</rt></ruby>がありません。(Hoy no tengo tiempo.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000016',
    kanji: '<ruby>約束<rt>やくそく</rt></ruby>',
    reading: 'やくそく',
    meaning_es: 'promesa; cita; compromiso',
    meaning_en: 'promise; appointment',
    jlpt_level: 4,
    part_of_speech: 'noun / suru verb',
    example_sentence: '<ruby>友達<rt>ともだち</rt></ruby>と<ruby>約束<rt>やくそく</rt></ruby>があります。(Tengo un compromiso con un amigo.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000017',
    kanji: '<ruby>準備<rt>じゅんび</rt></ruby>',
    reading: 'じゅんび',
    meaning_es: 'preparación; preparativos',
    meaning_en: 'preparation; setup',
    jlpt_level: 4,
    part_of_speech: 'noun / suru verb',
    example_sentence: '<ruby>旅行<rt>りょこう</rt></ruby>の<ruby>準備<rt>じゅんび</rt></ruby>をしています。(Estoy haciendo los preparativos del viaje.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000018',
    kanji: '<ruby>経験<rt>けいけん</rt></ruby>',
    reading: 'けいけん',
    meaning_es: 'experiencia',
    meaning_en: 'experience',
    jlpt_level: 4,
    part_of_speech: 'noun / suru verb',
    example_sentence: 'いい<ruby>経験<rt>けいけん</rt></ruby>になりました。(Fue una buena experiencia.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000019',
    kanji: '<ruby>習慣<rt>しゅうかん</rt></ruby>',
    reading: 'しゅうかん',
    meaning_es: 'hábito; costumbre',
    meaning_en: 'habit; custom',
    jlpt_level: 4,
    part_of_speech: 'noun',
    example_sentence: '<ruby>毎日<rt>まいにち</rt></ruby><ruby>復習<rt>ふくしゅう</rt></ruby>する<ruby>習慣<rt>しゅうかん</rt></ruby>をつける。(Adquirir el hábito de repasar todos los días.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '11111111-1111-4111-8111-000000000020',
    kanji: '<ruby>継続<rt>けいぞく</rt></ruby>',
    reading: 'けいぞく',
    meaning_es: 'continuación; constancia',
    meaning_en: 'continuation',
    jlpt_level: 3,
    part_of_speech: 'noun / suru verb',
    example_sentence: '<ruby>継続<rt>けいぞく</rt></ruby>は<ruby>力<rt>ちから</rt></ruby>なり。(La constancia es poder.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  }
];

