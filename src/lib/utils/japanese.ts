import * as wanakana from 'wanakana';
import type { VocabularyRecord } from '../db/schema';

let domPurifyPromise: Promise<typeof import('dompurify').default> | null = null;

function loadDOMPurify() {
  domPurifyPromise ??= import('dompurify').then((mod) => mod.default ?? (mod as unknown as typeof import('dompurify').default));
  return domPurifyPromise;
}

/**
 * Sanitiza e inserta HTML de etiquetas <ruby> de forma segura siguiendo Modern Web Guidance (sanitize-untrusted-html)
 */
export async function safeSetRubyHTML(el: HTMLElement | null, html: string): Promise<void> {
  if (!el) return;
  const elements = ['ruby', 'rt', 'rp', 'span'];
  const attributes = ['class'];

  if ('setHTML' in Element.prototype) {
    (el as HTMLElement & { setHTML: (h: string, opts: unknown) => void }).setHTML(html, {
      sanitizer: { elements, attributes }
    });
  } else {
    const DOMPurify = await loadDOMPurify();
    el.innerHTML = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [...elements, '#text'],
      ALLOWED_ATTR: attributes,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: false
    });
  }
}

/**
 * Extrae el texto plano sin etiquetas <ruby> ni <rt> (útil para TTS y búsquedas)
 */
export function stripRubyTags(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<rt>.*?<\/rt>/gi, '')
    .replace(/<rp>.*?<\/rp>/gi, '')
    .replace(/<\/?ruby>/gi, '')
    .trim();
}

/**
 * Si el backend envía <ruby> lo respeta; si envía kanji plano (ej. "覚える" y reading "おぼえる"),
 * construye dinámicamente la etiqueta <ruby> separando el okurigana en kana al final.
 */
export function ensureRubyMarkup(kanjiRaw: string | null, readingRaw: string): string {
  if (!kanjiRaw) return readingRaw;
  if (kanjiRaw.includes('<ruby>')) return kanjiRaw;

  const kanji = kanjiRaw.trim();
  const reading = readingRaw.trim();
  if (kanji === reading) return kanji;

  // Detectar okurigana común al final (ej. 食べる + たべる -> <ruby>食<rt>た</rt></ruby>べる)
  let suffixLen = 0;
  while (
    suffixLen < kanji.length &&
    suffixLen < reading.length &&
    kanji[kanji.length - 1 - suffixLen] === reading[reading.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const kanjiStem = kanji.slice(0, kanji.length - suffixLen);
  const readingStem = reading.slice(0, reading.length - suffixLen);
  const okurigana = kanji.slice(kanji.length - suffixLen);

  if (!kanjiStem) return kanji;
  return `<ruby>${kanjiStem}<rt>${readingStem}</rt></ruby>${okurigana}`;
}

/**
 * Convierte kana a romaji usando WanaKana.js
 */
export function toRomajiText(reading: string): string {
  return wanakana.toRomaji(stripRubyTags(reading));
}

/**
 * Convierte input en tiempo real (Romaji -> Hiragana/Katakana) para el buscador con WanaKana.js
 */
export function convertSearchQueryToKana(input: string): {
  raw: string;
  hiragana: string;
  katakana: string;
  romaji: string;
  isRomajiInput: boolean;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { raw: '', hiragana: '', katakana: '', romaji: '', isRomajiInput: false };
  }

  // Si el usuario escribe caracteres latinos que forman sílabas japonesas válidas
  const isLatin = /^[a-zA-Z\s'-]+$/.test(trimmed);
  const hiragana = isLatin ? wanakana.toHiragana(trimmed, { IMEMode: true }) : trimmed;
  const katakana = isLatin ? wanakana.toKatakana(trimmed, { IMEMode: true }) : trimmed;
  const romaji = wanakana.toRomaji(trimmed).toLowerCase();

  return {
    raw: trimmed,
    hiragana,
    katakana,
    romaji,
    isRomajiInput: isLatin
  };
}

/**
 * Separa la oración de ejemplo en japonés y su traducción entre paréntesis (formato Tatoeba del backend)
 */
export function splitExampleSentence(example: string | null): {
  jpHtml: string;
  jpPlain: string;
  translation: string;
} {
  if (!example) {
    return { jpHtml: '', jpPlain: '', translation: '' };
  }
  const match = example.match(/^(.*?)\s*[（(]([^）)]+)[）)]\s*$/);
  if (match) {
    return {
      jpHtml: match[1].trim(),
      jpPlain: stripRubyTags(match[1]),
      translation: match[2].trim()
    };
  }
  return {
    jpHtml: example,
    jpPlain: stripRubyTags(example),
    translation: ''
  };
}

let activeAudioInstance: HTMLAudioElement | null = null;

/**
 * Detiene cualquier audio japonés que se encuentre reproduciéndose actualmente
 */
export function stopJapaneseAudio(): void {
  if (activeAudioInstance) {
    try {
      activeAudioInstance.pause();
      activeAudioInstance.currentTime = 0;
    } catch {
      // Ignorar errores de cancelación
    }
    activeAudioInstance = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignorar
    }
  }
}

/**
 * Reproduce una URL de audio mediante HTML5 Audio asegurando inicio síncrono para cumplir con
 * la política de Autoplay / User Gesture en WebViews de Android.
 */
function playAudioStream(url: string, rate: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      activeAudioInstance = audio;
      audio.preload = 'auto';
      audio.playbackRate = rate;
      audio.src = url;

      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (success: boolean) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          if (activeAudioInstance === audio) {
            activeAudioInstance = null;
          }
          audio.onended = null;
          audio.onerror = null;
          resolve(success);
        }
      };

      timer = setTimeout(() => cleanup(false), timeoutMs);

      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => cleanup(false));
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Pronunciación de voz nativa japonesa (ja-JP) de alta fidelidad.
 * Estrategia multi-motor resiliente para móviles:
 *  1. Google Translate TTS (audio/mpeg directo sin requerir paquetes de voz locales)
 *  2. Youdao Japanese Audio Engine (fuente alternativa de pronunciación para diccionarios)
 *  3. Fallback a SpeechSynthesis del sistema/navegador en caso de operar sin conexión
 */
export async function speakJapanese(text: string, rate = 0.95): Promise<void> {
  if (typeof window === 'undefined') return;

  const cleanText = stripRubyTags(text).trim();
  if (!cleanText) return;

  stopJapaneseAudio();

  const encoded = encodeURIComponent(cleanText);

  // 1. Motor Primario: Google Translate TTS (Voz japonesa natural de alta calidad)
  const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encoded}`;
  const googleSuccess = await playAudioStream(googleTtsUrl, rate);
  if (googleSuccess) return;

  // 2. Motor Secundario: Youdao Japanese Audio (altamente tolerante en Android WebViews)
  const youdaoTtsUrl = `https://dict.youdao.com/dictvoice?audio=${encoded}&le=jap`;
  const youdaoSuccess = await playAudioStream(youdaoTtsUrl, rate);
  if (youdaoSuccess) return;

  // 3. Motor Terciario: SpeechSynthesis nativo del dispositivo (por si está offline)
  await fallbackSpeechSynthesis(cleanText, rate);
}

function fallbackSpeechSynthesis(cleanText: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ja-JP';
      utterance.rate = rate;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const jpVoice =
        voices.find((v) => v.lang === 'ja-JP' || v.lang === 'ja_JP') ||
        voices.find((v) => v.lang.startsWith('ja'));

      if (jpVoice) {
        utterance.voice = jpVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

/**
 * Normaliza un registro de vocabulario proveniente de PostgreSQL / API (camelCase o snake_case)
 */
export function normalizeVocabularyRecord(raw: Record<string, unknown>): VocabularyRecord {
  const reading = String(raw.reading ?? '');
  const rawKanji = raw.kanji != null ? String(raw.kanji) : null;

  return {
    id: String(raw.id),
    kanji: rawKanji ? ensureRubyMarkup(rawKanji, reading) : null,
    reading,
    meaning_es: String(raw.meaning_es ?? raw.meaningEs ?? ''),
    meaning_en: String(raw.meaning_en ?? raw.meaningEn ?? ''),
    jlpt_level: Number(raw.jlpt_level ?? raw.jlptLevel ?? 5),
    part_of_speech: String(raw.part_of_speech ?? raw.partOfSpeech ?? 'noun'),
    example_sentence:
      raw.example_sentence != null || raw.exampleSentence != null
        ? String(raw.example_sentence ?? raw.exampleSentence)
        : null,
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? new Date().toISOString())
  };
}

