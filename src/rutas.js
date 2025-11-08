// src/rutas.js
import * as THREE from "three";
import * as topojson from "topojson-client";
import { Map2Range } from "./utils.js";

import {
  scene,
  mapsx,
  mapsy,
  minlon,
  maxlon,
  minlat,
  maxlat,
} from "./scene.js";

export const rutasGeom = {};
export const gruposRutas = {};

export function indiceMasCercano(poly, stop) {
  let idx = 0,
    best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i].lat - stop.lat, poly[i].lon - stop.lon);
    if (d < best) (best = d), (idx = i);
  }
  return idx;
}

export function cargarRutas(listaRutas) {
  listaRutas.forEach((ruta) => {
    const lineaID = ruta.archivo.split("/")[1];

    if (!gruposRutas[lineaID]) {
      gruposRutas[lineaID] = new THREE.Group();
      scene.add(gruposRutas[lineaID]);
    }

    fetch(ruta.archivo)
      .then((r) => r.json())
      .then((data) => {
        let geo;
        if (data.type === "Topology") {
          const nombre = Object.keys(data.objects)[0];
          geo = topojson.feature(data, data.objects[nombre]);
        } else {
          geo = data;
        }

        geo.features.forEach((f) => {
          if (
            f.geometry.type === "LineString" ||
            f.geometry.type === "MultiLineString"
          ) {
            const coordsList =
              f.geometry.type === "LineString"
                ? [f.geometry.coordinates]
                : f.geometry.coordinates;

            coordsList.forEach((coords) => {
              const points = coords.map(
                ([lon, lat]) =>
                  new THREE.Vector3(
                    Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2),
                    Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2),
                    0
                  )
              );

              if (!rutasGeom[lineaID])
                rutasGeom[lineaID] = { ida: [], vuelta: [] };

              const esIda = ruta.archivo.includes("_ida");

              if (esIda) {
                rutasGeom[lineaID].ida.push(
                  coords.map(([lon, lat]) => ({ lon, lat }))
                );
              } else {
                rutasGeom[lineaID].vuelta.push(
                  coords.map(([lon, lat]) => ({ lon, lat }))
                );
              }

              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const material = new THREE.LineBasicMaterial({
                color: ruta.colorLinea,
              });
              const line = new THREE.Line(geometry, material);

              gruposRutas[lineaID].add(line);
            });
          }
        });
      });
  });
}

export function aplastarRutas(segmentos) {
  let lista = segmentos.map((seg) => [...seg]);

  let resultado = lista.shift();

  while (lista.length > 0) {
    const ultimo = resultado[resultado.length - 1];

    let mejorIdx = -1;
    let mejorDist = Infinity;
    let invertir = false;

    for (let i = 0; i < lista.length; i++) {
      const seg = lista[i];

      const dInicio = Math.hypot(
        seg[0].lon - ultimo.lon,
        seg[0].lat - ultimo.lat
      );

      const dFin = Math.hypot(
        seg[seg.length - 1].lon - ultimo.lon,
        seg[seg.length - 1].lat - ultimo.lat
      );

      if (dInicio < mejorDist) {
        mejorDist = dInicio;
        mejorIdx = i;
        invertir = false;
      }

      if (dFin < mejorDist) {
        mejorDist = dFin;
        mejorIdx = i;
        invertir = true;
      }
    }

    let siguiente = lista.splice(mejorIdx, 1)[0];

    if (invertir) siguiente.reverse();

    resultado.push(...siguiente);
  }

  return resultado;
}
