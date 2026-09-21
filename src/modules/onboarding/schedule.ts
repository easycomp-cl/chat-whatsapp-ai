const TIME_RANGE = /(\d{1,2}:\d{2})\s*[\u2013\-–]\s*(\d{1,2}:\d{2})/;
const DAY_HINT =
  /lun|mar|mi[eé]|jue|vie|s[aá]b|dom|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo/i;

/** Horario con al menos un tramo HH:MM–HH:MM y un día reconocible (wizard o texto legado). */
export function isScheduleParseable(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  if (!TIME_RANGE.test(trimmed)) return false;
  return DAY_HINT.test(trimmed);
}
