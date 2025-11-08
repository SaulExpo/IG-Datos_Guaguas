import * as THREE from "three";
import { Map2Range } from "./utils.js";
import {
  minlon,
  maxlon,
  minlat,
  maxlat,
  mapsx,
  mapsy,
  scene,
} from "./scene.js";
import * as topojson from "topojson-client";

function distancia(a, b) {
  const dx = (a.lon - b.lon) * 90000;
  const dy = (a.lat - b.lat) * 111000;
  return Math.sqrt(dx * dx + dy * dy);
}

function puntosCadaXN(coords, paso) {
  const result = [];
  let acum = 0;

  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = distancia(a, b);

    if (d <= 0) continue;

    let t = (paso - acum) / d;

    while (t <= 1) {
      result.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      });
      t += paso / d;
    }

    acum = d % paso;
  }

  return result;
}

export function cargarFarolas(url) {
  fetch(url)
    .then((r) => r.json())
    .then((topo) => {
      const grupos = Object.keys(topo.objects);

      const puntosDeLuz = [];
      const PASO_METROS = 30;

      grupos.forEach((nombreCapa) => {
        const geo = topojson.feature(topo, topo.objects[nombreCapa]);

        geo.features.forEach((f) => {
          if (f.geometry.type === "Point") {
            const [lon, lat] = f.geometry.coordinates;
            puntosDeLuz.push({ lat, lon });
          }
          if (f.geometry.type === "Polygon") {
            f.geometry.coordinates.forEach((ring) => {
              const coords = ring.map(([lon, lat]) => ({ lat, lon }));
              puntosDeLuz.push(...puntosCadaXN(coords, PASO_METROS));
            });
          }
          if (f.geometry.type === "LineString") {
            const coords = f.geometry.coordinates.map(([lon, lat]) => ({
              lat,
              lon,
            }));
            puntosDeLuz.push(...puntosCadaXN(coords, PASO_METROS));
          }
          if (f.geometry.type === "MultiLineString") {
            f.geometry.coordinates.forEach((linea) => {
              const coords = linea.map(([lon, lat]) => ({ lat, lon }));
              puntosDeLuz.push(...puntosCadaXN(coords, PASO_METROS));
            });
          }
        });
      });

      const luces = new THREE.Group();

      const materialFarola = new THREE.MeshBasicMaterial({
        color: 0xffc878,
        transparent: true,
        opacity: 0.9,
      });

      const geometryFarola = new THREE.SphereGeometry(0.003, 8, 8);

      puntosDeLuz.forEach(({ lat, lon }) => {
        const x = Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
        const y = Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2);

        const halo = new THREE.Mesh(geometryFarola, materialFarola);
        halo.position.set(x, y, 0.005);
        luces.add(halo);
      });

      luces.visible = false;
      scene.add(luces);
      window.farolasMesh = luces;
    });
}
