import type { VocabularyRecord } from './schema';

/**
 * Catálogo semilla offline-first sincronizado 1:1 con los UUIDs reales de oboeru_prod.
 * Incluye soporte nativo para etiquetas HTML <ruby> en kanji/oraciones y datos limpios.
 */
export const INITIAL_VOCABULARY_SEED: VocabularyRecord[] = [
  {
    id: 'e1b83687-486f-43f9-8965-9409a507bf13',
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
    id: 'ff62b02c-0edd-4cdd-852b-89ca0bf1af93',
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
    id: 'f2f210ad-3e28-4fef-96df-6da87158dbbb',
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
    id: 'c2ba27b8-e198-48de-a1e6-99abcbdda89c',
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
    id: '4978ef76-58d7-4e99-a2b8-e193e15df2f6',
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
    id: 'f8e093e8-a303-4e8b-a46a-ef07d344b05e',
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
    id: '07893842-615d-4dfe-8618-070f6281e47e',
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
    id: 'e2f64bd0-7a16-4b13-b01c-636d3e9fbbd2',
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
    id: 'b1f95c67-fca7-4433-a204-a8b959fef98b',
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
    id: '5f7c1670-42f7-49b3-b398-f9eae5b91a93',
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
    id: '0b8ae897-0ab6-43f2-aff1-8ac947c20be6',
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
    id: 'f7e23b39-316a-44a7-9d77-eb01dc069a5a',
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
    id: '9b90e089-894c-458b-b9c8-730b63ebb21f',
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
    id: 'df45f236-d57e-4ef2-838d-c36535b79fd6',
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
    id: 'd7e1e8db-731b-46d4-a115-e1ae517956c7',
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
    id: 'd4425451-6c8c-472a-80a1-f850f9e32fdb',
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
    id: 'd3e01516-d226-4c6e-81a4-d4125bc47f2b',
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
    id: '4f6a2aa1-b05d-47c2-9ef7-21e78f0b852b',
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
    id: '5c647ddd-0162-4ead-9952-da7f3372fa4e',
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
    id: '603529fd-4863-4ecd-9d1d-8a427a6784b5',
    kanji: '<ruby>継続<rt>けいぞく</rt></ruby>',
    reading: 'けいぞく',
    meaning_es: 'continuación; constancia',
    meaning_en: 'continuation',
    jlpt_level: 3,
    part_of_speech: 'noun / suru verb',
    example_sentence: '<ruby>継続<rt>けいぞく</rt></ruby>は<ruby>力<rt>ちから</rt></ruby>なり。(La constancia es poder.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '038bd4f7-7cfa-4c0f-86bd-6fb66e276c7e',
    kanji: '<ruby>食<rt>た</rt></ruby>べ<ruby>物<rt>もの</rt></ruby>',
    reading: 'たべもの',
    meaning_es: 'comida; alimento',
    meaning_en: 'food',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>日本<rt>にほん</rt></ruby>の<ruby>食<rt>た</rt></ruby>べ<ruby>物<rt>もの</rt></ruby>が<ruby>好<rt>す</rt></ruby>きです。(Me gusta la comida japonesa.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '7a5e537b-ddde-4394-ad41-a6ae39664cef',
    kanji: 'ご<ruby>飯<rt>はん</rt></ruby>',
    reading: 'ごはん',
    meaning_es: 'arroz cocido; comida',
    meaning_en: 'cooked rice; meal',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>晩<rt>ばん</rt></ruby>ご<ruby>飯<rt>はん</rt></ruby>を<ruby>作<rt>つく</rt></ruby>ります。(Preparo la cena / comida.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: 'ff6ee796-7c6a-4579-9d6a-06d1a7809fd1',
    kanji: '<ruby>料理<rt>りょうり</rt></ruby>',
    reading: 'りょうり',
    meaning_es: 'cocina; comida; plato',
    meaning_en: 'cooking; cuisine; dish',
    jlpt_level: 5,
    part_of_speech: 'noun / suru verb',
    example_sentence: '<ruby>母<rt>はは</rt></ruby>の<ruby>料理<rt>りょうり</rt></ruby>はおいしいです。(La comida de mi madre es deliciosa.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: 'dead9357-2518-4ec0-a296-642530642124',
    kanji: '<ruby>飲<rt>の</rt></ruby>み<ruby>物<rt>もの</rt></ruby>',
    reading: 'のみもの',
    meaning_es: 'bebida',
    meaning_en: 'drink; beverage',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>冷<rt>つめ</rt></ruby>たい<ruby>飲<rt>の</rt></ruby>み<ruby>物<rt>もの</rt></ruby>をください。(Deme una bebida fría, por favor.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: 'ac166e39-5b1f-4869-aded-2b98202934bf',
    kanji: '<ruby>水<rt>みず</rt></ruby>',
    reading: 'みず',
    meaning_es: 'agua',
    meaning_en: 'water',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: 'お<ruby>水<rt>みず</rt></ruby>を一杯ください。(Un vaso de agua, por favor.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: 'ad5c991e-865b-4051-b9f5-167263c00d96',
    kanji: 'お<ruby>茶<rt>ちゃ</rt></ruby>',
    reading: 'おちゃ',
    meaning_es: 'té; té verde',
    meaning_en: 'tea; green tea',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>日本<rt>にほん</rt></ruby>のお<ruby>茶<rt>ちゃ</rt></ruby>を<ruby>飲<rt>の</rt></ruby>みます。(Tomo té japonés.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '292e286b-01aa-4c11-a463-a1c12af2667d',
    kanji: '<ruby>肉<rt>にく</rt></ruby>',
    reading: 'にく',
    meaning_es: 'carne',
    meaning_en: 'meat',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>野菜<rt>やさい</rt></ruby>と<ruby>肉<rt>にく</rt></ruby>を<ruby>買<rt>か</rt></ruby>いました。(Compré verduras y carne.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '10d9b521-9e3e-43a4-b25c-3a233e26c368',
    kanji: '<ruby>魚<rt>さかな</rt></ruby>',
    reading: 'さかな',
    meaning_es: 'pescado; pez',
    meaning_en: 'fish',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>新鮮<rt>しんせん</rt></ruby>な<ruby>魚<rt>さかな</rt></ruby>を<ruby>食<rt>た</rt></ruby>べたいです。(Quiero comer pescado fresco.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '03955632-9316-4aa2-9cd0-bb00df820839',
    kanji: '<ruby>野菜<rt>やさい</rt></ruby>',
    reading: 'やさい',
    meaning_es: 'verdura; vegetal',
    meaning_en: 'vegetable',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>毎日<rt>まいにち</rt></ruby><ruby>野菜<rt>やさい</rt></ruby>を<ruby>食<rt>た</rt></ruby>べます。(Como verduras todos los días.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  },
  {
    id: '6acb80e2-b08e-441d-840f-9668032cf8e9',
    kanji: '<ruby>果物<rt>くだもの</rt></ruby>',
    reading: 'くだもの',
    meaning_es: 'fruta',
    meaning_en: 'fruit',
    jlpt_level: 5,
    part_of_speech: 'noun',
    example_sentence: '<ruby>甘<rt>あま</rt></ruby>い<ruby>果物<rt>くだもの</rt></ruby>が<ruby>好<rt>す</rt></ruby>きです。(Me gusta la fruta dulce.)',
    updated_at: '2026-10-31T20:00:00.000Z'
  }
];
