// src/datos.js
import { horaASegundos, splitCSV } from "./utils.js";

export let stopTimesCsv;
export let tripsCsv;
export let calendar;

export function procesarStops(csv) {
  const lines = csv.trim().split("\n");
  lines.shift();

  const map = {};
  lines.forEach((l) => {
    const c = splitCSV(l);
    const stop_id = String(c[0]).trim();
    const name = c[2];
    const lat = parseFloat(c[4]);
    const lon = parseFloat(c[5]);
    if (!stop_id || isNaN(lat) || isNaN(lon)) return;
    map[stop_id] = { name, lat, lon };
  });

  return map;
}

export function procesarStopTimes(csv, tripID) {
  const lines = csv.trim().split("\n");
  const headers = lines.shift().split(",");

  const tid = headers.indexOf("trip_id");
  const sid = headers.indexOf("stop_id");
  const arr = headers.indexOf("arrival_time");
  const dep = headers.indexOf("departure_time");
  const seq = headers.indexOf("stop_sequence");

  return lines
    .map((l) => l.split(","))
    .filter((c) => c[tid] === tripID)
    .map((c) => ({
      stop_id: c[sid],
      t_arr: horaASegundos(c[arr]),
      t_dep: horaASegundos(c[dep]),
      seq: parseInt(c[seq]),
    }))
    .sort((a, b) => a.seq - b.seq);
}

export function procesarCalendar(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines.shift().split(",");

  const indexService = headers.indexOf("service_id");

  const index = {
    monday: headers.indexOf("monday"),
    tuesday: headers.indexOf("tuesday"),
    wednesday: headers.indexOf("wednesday"),
    thursday: headers.indexOf("thursday"),
    friday: headers.indexOf("friday"),
    saturday: headers.indexOf("saturday"),
    sunday: headers.indexOf("sunday"),
  };

  const map = {};

  lines.forEach((l) => {
    const c = l.split(",");
    const id = c[indexService];
    map[id] = {
      monday: +c[index.monday],
      tuesday: +c[index.tuesday],
      wednesday: +c[index.wednesday],
      thursday: +c[index.thursday],
      friday: +c[index.friday],
      saturday: +c[index.saturday],
      sunday: +c[index.sunday],
    };
  });

  return map;
}
