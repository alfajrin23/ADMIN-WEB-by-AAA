const JAKARTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Jakarta",
});

export function getCurrentJakartaDate(date = new Date()) {
  return JAKARTA_DATE_FORMATTER.format(date);
}

export function getMonthStartJakartaDate(date = new Date()) {
  const currentDate = getCurrentJakartaDate(date);
  return `${currentDate.slice(0, 7)}-01`;
}
