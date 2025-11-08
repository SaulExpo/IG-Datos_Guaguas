// src/paradas.js
import * as THREE from "three";
import * as topojson from "topojson-client";
import {
  scene,
  mapsx,
  mapsy,
  minlon,
  maxlon,
  minlat,
  maxlat,
} from "./scene.js";
import { Map2Range } from "./utils.js";
import { segundosSimulados, activos, activosGlobal, stops } from "./tiempo.js";
import { seleccion } from "./index.js";
import { gruposRutas } from "./rutas.js";

export const gruposParadas = {};
export const etiquetasParadas = [];
export const allEtiquetas = [];
export const pendingParadas = [];
export const stopsIda = {};
export const stopsVuelta = {};

export function crearEtiquetaHTML(name, x, y, z, lineaID, stopID) {
  const div = document.createElement("div");
  div.className = "etiqueta-parada";
  div.innerHTML = `<img src="src/bus.png" class="icono-guagua">`;
  div.style.pointerEvents = "auto";
  div.style.cursor = "pointer";

  const position = new THREE.Vector3(x, y, z);

  div.addEventListener("click", () => {
    mostrarETAParada(stopID);
  });

  document.body.appendChild(div);

  return { name, div, position, lineaID, stopID };
}

export function cargarParadas(listaParadas) {
  listaParadas.forEach((paradaInfo) => {
    const lineaID = paradaInfo.archivo.split("/")[1];

    if (!gruposParadas[lineaID]) {
      gruposParadas[lineaID] = new THREE.Group();
      scene.add(gruposParadas[lineaID]);
    }

    fetch(paradaInfo.archivo)
      .then((r) => r.json())
      .then((data) => {
        let geo;
        if (data.type === "Topology") {
          const nombre = Object.keys(data.objects)[0];
          geo = topojson.feature(data, data.objects[nombre]);
        } else geo = data;

        geo.features.forEach((f) => {
          if (
            f.geometry.type === "Point" &&
            f.properties.ref &&
            f.properties.name &&
            f.properties &&
            (f.properties.highway === "bus_stop" ||
              f.properties.public_transport === "platform" ||
              f.properties.public_transport === "stop_position")
          ) {
            const [lon, lat] = f.geometry.coordinates;
            const marker = new THREE.Mesh(
              new THREE.SphereGeometry(0.005, 12, 12),
              new THREE.MeshStandardMaterial({ color: paradaInfo.colorParada })
            );

            marker.position.set(
              Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2),
              Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2),
              0
            );

            const stopID = f.properties.ref;
            marker.userData.stopID = stopID;
            marker.cursor = "pointer";
            gruposParadas[lineaID].add(marker);

            pendingParadas.push({
              lineaID,
              stopID,
              x: marker.position.x,
              y: marker.position.y,
              z: marker.position.z,
            });

            const etiqueta = crearEtiquetaHTML(
              f.properties.name || stopID,
              marker.position.x,
              marker.position.y,
              marker.position.z + 0.02,
              lineaID,
              stopID
            );
            etiquetasParadas.push(etiqueta);

            if (!stopsIda[lineaID]) stopsIda[lineaID] = [];
            if (!stopsVuelta[lineaID]) stopsVuelta[lineaID] = [];

            if (paradaInfo.archivo.includes("_ida"))
              stopsIda[lineaID].push(stopID);
            else stopsVuelta[lineaID].push(stopID);
          }
        });
      });
  });
}

export function mostrarPanelETA(stopID, lista) {
  let nombre = "";
  etiquetasParadas.forEach((etiqueta) => {
    if (etiqueta.stopID == stopID) {
      nombre = etiqueta.name;
    }
  });
  const cont = document.getElementById("contenidoETA");
  const panel = document.getElementById("panelETA");

  if (lista.length === 0) {
    cont.innerHTML = `<b>${nombre}</b><br><br>No hay guaguas en camino.`;
  } else {
    cont.innerHTML =
      `<b>${nombre}</b><br><br>` +
      lista
        .slice(0, 4)
        .map((r) => {
          let min = Math.floor(r.tiempoRestante / 60) + "m";
          if (min === "0m") min = "Inminente";
          return `• Línea ${r.trip
            .match(/\d{3}/)[0]
            .replace(/^0+/, "")} <b>${min}</b>`;
        })
        .join("<br>");
  }

  panel.style.display = "block";
}

export function mostrarETAParada(stopID) {
  if (seleccion == "all") {
    const ahora = segundosSimulados;
    const resultados = [];
    activosGlobal.forEach(({ stopTimes, mesh, tripID }) => {
      for (let i = 0; i < stopTimes.length; i++) {
        if (stopTimes[i].stop_id === stopID) {
          const llegada = stopTimes[i].arr;
          const tiempoRestante = llegada - ahora;
          let trip = tripID;
          if (tiempoRestante > 0) {
            resultados.push({
              trip,
              tiempoRestante,
            });
          }
        }
      }
    });

    mostrarPanelETA(stopID, resultados);
  } else {
    const ahora = segundosSimulados;
    const resultados = [];
    activos.forEach(({ trip, stopTimes }) => {
      const st = stopTimes.find((s) => s.stop_id === stopID);
      if (!st) return;

      const tiempoRestante = st.t_arr - ahora;

      if (tiempoRestante > 0) {
        resultados.push({
          trip,
          tiempoRestante,
        });
      }
    });

    resultados.sort((a, b) => a.tiempoRestante - b.tiempoRestante);
    mostrarPanelETA(stopID, resultados);
  }
}

export function mostrarTodasLasLineas() {
  for (const linea in gruposRutas) gruposRutas[linea].visible = true;
  for (const linea in gruposParadas) gruposParadas[linea].visible = true;
  etiquetasParadas.forEach((et) => (et.visibleForRoute = true));
  document.getElementById("panelGuaguasActivas").innerHTML = "";
  return;
}
