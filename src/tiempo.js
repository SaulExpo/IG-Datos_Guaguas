// src/tiempo.js
import { rutasGeom, aplastarRutas } from "./rutas.js";
import { procesarStops, procesarCalendar } from "./datos.js";
import {
  crearBusMesh,
  actualizarPosicionBus,
  posicionGuaguaAhoraEnPoly,
} from "./buses.js";
import { horaASegundos, formatoHora } from "./utils.js";
import { etiquetasParadas } from "./paradas.js";

export let stopTimesCsv = "";
export let tripsCsv = "";
export let calendar;
export let polyIda = [];
export let polyVuelta = [];
export let activos = [];
export let activosGlobal = [];
export let stops = [];
export let indicesIda = {};
export let indicesVuelta = {};
export let diaSimulado = null;
const hora_actual = new Date();

export let segundosSimulados =
  hora_actual.getHours() * 3600 +
  hora_actual.getMinutes() * 60 +
  hora_actual.getSeconds();
export let velocidadTiempo = 1;
export let ultimoFrame = Date.now();
let ultimoMinutoMostrado = 0;

export function actualizarPanelGuaguas(activos) {
  const panel = document.getElementById("panelGuaguasActivas");
  panel.innerHTML = "";

  activos.forEach(({ trip, stopTimes }) => {
    const info = infoSiguienteParada(stopTimes);
    if (!info) return;
    const lineaID = trip.match(/\d{3}/)[0].replace(/^0+/, "");

    const vaIda = esIdaParaEsteTrip(trip, tripsCsv);
    const sentido = vaIda ? "➡️ IDA" : "⬅️ VUELTA";

    const div = document.createElement("div");
    div.className = "bus";
    div.dataset.trip = trip;
    div.innerHTML = `
      <strong>Guagua ${trip}</strong><br>
      ${sentido}<br>
      Linea: ${lineaID}<br>
      Próx parada: ${stops[info.siguienteParada].name}<br>
      Llega: ${formatoHora(info.llegadaEstimada)}
    `;

    panel.appendChild(div);
  });
}

export function procesarStopTimes(csv, tripID) {
  const lineas = csv.trim().split("\n");
  const headers = lineas.shift().split(",");

  const tid = headers.indexOf("trip_id");
  const sid = headers.indexOf("stop_id");
  const arr = headers.indexOf("arrival_time");
  const dep = headers.indexOf("departure_time");
  const seq = headers.indexOf("stop_sequence");

  const result = lineas
    .map((l) => l.split(","))
    .filter((c) => c[tid] === tripID)
    .map((c) => ({
      stop_id: c[sid],
      t_arr: horaASegundos(c[arr]),
      t_dep: horaASegundos(c[dep]),
      seq: parseInt(c[seq]),
    }))
    .sort((a, b) => a.seq - b.seq);

  return result;
}

function servicesActivosHoy(calendar) {
  const d = diaSimulado != null ? diaSimulado : new Date().getDay();
  const dia = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][d];

  return Object.keys(calendar).filter(
    (service_id) => calendar[service_id][dia] === 1
  );
}

function serviciosDeLinea(tripsCsv, routeID) {
  const lines = tripsCsv.trim().split("\n");
  const headers = lines.shift().split(",");
  const colRoute = headers.indexOf("route_id");
  const colServ = headers.indexOf("service_id");

  const set = new Set();
  lines.forEach((l) => {
    const c = l.split(",");
    if (c[colRoute] === routeID) set.add(c[colServ]);
  });
  return [...set];
}

export function servicioCorrectoParaLinea(calendar, tripsCsv, routeID) {
  const activosHoy = servicesActivosHoy(calendar);
  const usadosPorLinea = serviciosDeLinea(tripsCsv, routeID);
  return activosHoy.find((id) => usadosPorLinea.includes(id)) || null;
}

export function prefijoDeServicio(tripsCsv, service_id) {
  const lines = tripsCsv.trim().split("\n");
  const headers = lines.shift().split(",");
  const colServ = headers.indexOf("service_id");
  const colTrip = headers.indexOf("trip_id");

  for (const l of lines) {
    const c = l.split(",");
    if (c[colServ] === service_id) {
      return c[colTrip].match(/^[A-Za-z]+/)[0];
    }
  }
  return null;
}

export function tripsEnCurso(stopTimesCsv, lineNumber, prefijo) {
  const now =
    segundosSimulados != null
      ? segundosSimulados
      : horaASegundos(new Date().toTimeString().substring(0, 8));

  const regex = new RegExp(`^${prefijo}${lineNumber.padStart(3, "0")}`);
  const lines = stopTimesCsv.trim().split("\n");

  const grupos = {};

  lines.slice(1).forEach((line) => {
    const c = line.split(",");
    const trip = c[0];
    if (!regex.test(trip)) return;
    if (!grupos[trip]) grupos[trip] = [];
    grupos[trip].push(c);
  });

  const activos = [];

  for (const trip in grupos) {
    const rows = grupos[trip]
      .map((c) => ({
        arr: horaASegundos(c[1]),
        dep: horaASegundos(c[2]),
      }))
      .sort((a, b) => a.dep - b.dep);

    if (now >= rows[0].dep && now <= rows[rows.length - 1].arr) {
      activos.push(trip);
    }
  }

  return activos;
}

export function tripsEnCursoGlobal(stopTimesCsv) {
  const now =
    segundosSimulados != null
      ? segundosSimulados
      : horaASegundos(new Date().toTimeString().substring(0, 8));

  const lines = stopTimesCsv.trim().split("\n");
  lines.shift();

  const grupos = {};

  lines.forEach((l) => {
    const c = l.split(",");
    const trip = c[0];

    if (!grupos[trip]) grupos[trip] = [];

    grupos[trip].push({
      arr: horaASegundos(c[1]),
      dep: horaASegundos(c[2]),
      stop_id: c[3],
    });
  });

  activosGlobal = [];

  for (const trip in grupos) {
    const rows = grupos[trip].sort((a, b) => a.dep - b.dep);

    if (now >= rows[0].dep && now <= rows[rows.length - 1].arr) {
      const match = trip.match(/(\d{1,3})(?!.*\d)/);
      const lineaID = match ? match[1].replace(/^0+/, "") : null;

      activosGlobal.push({
        tripID: trip,
        lineaID,
        stopTimes: rows,
      });
    }
  }

  return activosGlobal;
}

export function esIdaParaEsteTrip(tripID, tripsCsv) {
  const line = tripsCsv
    .split("\n")
    .find((l) => l.startsWith(tripID + ",") || l.includes("," + tripID + ","));

  if (!line) return true;

  const cols = line.split(",");
  const direction = parseInt(cols[5]);

  return direction === 1;
}

export function infoSiguienteParada(stopTimes) {
  let s;

  if (segundosSimulados != null) {
    s = segundosSimulados;
  } else {
    const ahora = new Date();
    s = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();
  }

  for (let i = 0; i < stopTimes.length - 1; i++) {
    const A = stopTimes[i];
    const B = stopTimes[i + 1];

    if (s >= A.t_dep && s <= B.t_arr) {
      return {
        paradaActual: A.stop_id,
        siguienteParada: B.stop_id,
        llegadaEstimada: B.t_arr,
      };
    }
  }

  return null;
}

export async function cargarDatosYCrearGuaguas(lineaID = "25") {
  limpiarGuaguas();
  return Promise.all([
    fetch("src/stops.txt").then((r) => r.text()),
    fetch("src/stop_times.txt").then((r) => r.text()),
    fetch("src/calendar.txt").then((r) => r.text()),
    fetch("src/trips.txt").then((r) => r.text()),
  ]).then(([stopsCsv, stopTimesCsvLocal, calendarCsvLocal, tripsCsvLocal]) => {
    stopTimesCsv = stopTimesCsvLocal;
    tripsCsv = tripsCsvLocal;

    polyIda = aplastarRutas(rutasGeom[lineaID].ida);
    polyVuelta = aplastarRutas(rutasGeom[lineaID].vuelta);

    stops = procesarStops(stopsCsv);
    etiquetasParadas.forEach((et) => {
      et.visibleForRoute = et.lineaID === lineaID;
    });

    calendar = procesarCalendar(calendarCsvLocal);
    const servicio = servicioCorrectoParaLinea(calendar, tripsCsv, lineaID);
    const prefijo = prefijoDeServicio(tripsCsv, servicio);

    const trips = tripsEnCurso(stopTimesCsv, lineaID, prefijo);
    tripsEnCursoGlobal(stopTimesCsv);

    activos = trips.map((trip) => {
      const stopTimes = procesarStopTimes(stopTimesCsv, trip);
      let paradasTrip = obtenerParadasDeTrip(stopTimes, stops);

      function distancia(a, b) {
        return Math.hypot(a.lat - b.lat, a.lon - b.lon);
      }

      const vaIda = esIdaParaEsteTrip(trip, tripsCsv);
      const poly = vaIda ? polyIda : polyVuelta;

      const dInicio = distancia(paradasTrip[0], poly[0]);
      const dFinal = distancia(paradasTrip[0], poly[poly.length - 1]);

      if (dFinal < dInicio) {
        paradasTrip.reverse();
      }

      setInterval(() => {
        const ahora = Date.now();
        const delta = (ahora - ultimoFrame) / 1000;
        ultimoFrame = ahora;

        if (segundosSimulados != null) {
          segundosSimulados += delta * velocidadTiempo;
          if (segundosSimulados > 86400) segundosSimulados -= 86400;

          document.getElementById("sliderHora").value = segundosSimulados;
          document.getElementById("labelHora").value = formatoHora(
            Math.floor(segundosSimulados)
          );
        }
        if (!activos) return;

        activos.forEach(({ stopTimes, poly, mesh }) => {
          const pos = posicionGuaguaAhoraEnPoly(stopTimes, stops, poly);
          if (pos) {
            actualizarPosicionBus(mesh, pos, poly);
          }
        });

        const minutoActual = Math.floor(segundosSimulados / 60);

        if (minutoActual !== ultimoMinutoMostrado) {
          ultimoMinutoMostrado = minutoActual;
          actualizarPanelGuaguas(activos, polyIda, polyVuelta);
        }
      }, 200);

      return {
        trip,
        stopTimes,
        poly,
        vaIda,
        mesh: crearBusMesh(),
      };
    });
  });
}

export function setDiaSimulado(v) {
  diaSimulado = v;
}

export function setSegundosSimulados(v) {
  segundosSimulados = v;
}

export function setActivos(nuevos) {
  activos = nuevos;
}

export function limpiarGuaguas() {
  if (!activos) return;

  activos.forEach(({ mesh }) => {
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
  });
}

function obtenerParadasDeTrip(stopTimes, stops) {
  return stopTimes.map((st) => stops[st.stop_id]).filter(Boolean);
}
