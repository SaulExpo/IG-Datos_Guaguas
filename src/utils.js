// src/utils.js

export function Map2Range(val, vmin, vmax, dmin, dmax) {
  let t = 1 - (vmax - val) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

export function horaASegundos(hora) {
  let [h, m, s] = hora.split(":").map(Number);
  if (!s) s = 0;
  return h * 3600 + m * 60 + s;
}

export function formatoHora(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function splitCSV(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let char of line) {
    if (char === '"') insideQuotes = !insideQuotes;
    else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else current += char;
  }
  result.push(current);
  return result;
}

export function interpolar(a, b, t) {
  return a + (b - a) * t;
}

export function interpolarCoordenadas(a, b, t) {
  return {
    lat: interpolar(a.lat, b.lat, t),
    lon: interpolar(a.lon, b.lon, t),
  };
}
