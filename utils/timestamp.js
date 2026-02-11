export function getShortTimestamp() {
    const d = new Date();
    const YY = String(d.getFullYear()).slice(-2);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const H = String(d.getHours()).padStart(2, '0');
    const M = String(d.getMinutes()).padStart(2, '0');
    const S = String(d.getSeconds()).padStart(2, '0');
    return `${YY}${MM}${DD}${H}${M}${S}`;
  }