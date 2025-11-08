// src/buses.js
import * as THREE from "three";
import {
  scene,
  minlat,
  minlon,
  maxlat,
  maxlon,
  mapsx,
  mapsy,
} from "./scene.js";
import { Map2Range } from "./utils.js";
import {
  segundosSimulados,
  servicioCorrectoParaLinea,
  calendar,
  tripsCsv,
  stopTimesCsv,
  prefijoDeServicio,
  tripsEnCurso,
  setActivos,
  activos,
  esIdaParaEsteTrip,
  polyIda,
  polyVuelta,
} from "./tiempo.js";
import { procesarStopTimes } from "./datos.js";

let modeloGuagua = null;
export let baseRotation = new THREE.Quaternion();

export function setModeloGuagua(model) {
  modeloGuagua = model;
}

export function crearBusMesh() {
  const bus = new THREE.Group();
  bus.tramo = null;
  const ESCALA = 0.125;

  //Cuerpo
  const cuerpo = new THREE.Mesh(
    new THREE.BoxGeometry(0.25 * ESCALA, 0.07 * ESCALA, 0.07 * ESCALA),
    new THREE.MeshStandardMaterial({ color: 0xffd43b })
  );
  bus.add(cuerpo);

  //Ventanas
  const ventanaGeo = new THREE.BoxGeometry(
    0.1 * ESCALA,
    0.03 * ESCALA,
    0.002 * ESCALA
  );
  const ventanaMat = new THREE.MeshStandardMaterial({ color: 0xeec32a });

  const ventanaDerecha1 = new THREE.Mesh(ventanaGeo, ventanaMat);
  ventanaDerecha1.position.set(0.05 * ESCALA, 0.015 * ESCALA, 0.036 * ESCALA);
  bus.add(ventanaDerecha1);

  const ventanaDerecha2 = ventanaDerecha1.clone();
  ventanaDerecha2.position.x = -0.05 * ESCALA;
  bus.add(ventanaDerecha2);

  const ventanaIzquierda1 = ventanaDerecha1.clone();
  ventanaIzquierda1.position.z = -0.036 * ESCALA;
  bus.add(ventanaIzquierda1);

  const ventanaIzquierda2 = ventanaDerecha2.clone();
  ventanaIzquierda2.position.z = -0.036 * ESCALA;
  bus.add(ventanaIzquierda2);

  //Ruedas
  const ruedaGeo = new THREE.CylinderGeometry(
    0.02 * ESCALA,
    0.02 * ESCALA,
    0.01 * ESCALA,
    12
  );
  const ruedaMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

  function rueda(x, z) {
    const r = new THREE.Mesh(ruedaGeo, ruedaMat);
    r.rotation.x = Math.PI / 2;
    r.position.set(x * ESCALA, -0.035 * ESCALA, z * ESCALA);
    bus.add(r);
  }

  rueda(-0.09, 0.03);
  rueda(0.09, 0.03);
  rueda(-0.09, -0.03);
  rueda(0.09, -0.03);

  //Faros frontales
  const faroGeo = new THREE.BoxGeometry(
    0.015 * ESCALA,
    0.015 * ESCALA,
    0.015 * ESCALA
  );
  const faroMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });

  function faro(offsetZ) {
    const f = new THREE.Mesh(faroGeo, faroMat);

    f.position.set(-0.13 * ESCALA, 0.0 * ESCALA, offsetZ * ESCALA);

    bus.add(f);
  }

  faro(0.03);
  faro(-0.03);

  bus.rotation.x = -Math.PI / 2;
  bus.rotation.z = -Math.PI;

  baseRotation.copy(bus.quaternion);

  bus.castShadow = true;
  scene.add(bus);

  return bus;
}

export function actualizarPosicionBus(mesh, pos, poly) {
  const t = pos.t;
  const idx = Math.floor(t);
  const frac = t - idx;

  const A = poly[idx];
  const B = poly[idx + 1] ? poly[idx + 1] : A;

  const lon = A.lon + (B.lon - A.lon) * frac;
  const lat = A.lat + (B.lat - A.lat) * frac;

  const x = Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
  const y = Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2);

  mesh.position.set(x, y, 0.01);

  const Ax = Map2Range(A.lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
  const Ay = Map2Range(A.lat, minlat, maxlat, -mapsy / 2, mapsy / 2);
  const Bx = Map2Range(B.lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
  const By = Map2Range(B.lat, minlat, maxlat, -mapsy / 2, mapsy / 2);

  const dir = new THREE.Vector3(Bx - Ax, By - Ay, 0).normalize();
  const targetQuat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    dir
  );

  if (baseRotation) {
    const q = targetQuat.clone().multiply(baseRotation);
    mesh.quaternion.slerp(q, 0.25);
  } else {
    mesh.quaternion.copy(targetQuat);
  }
}

export function recargarGuaguas(lineaID) {
  const servicio25 = servicioCorrectoParaLinea(calendar, tripsCsv, lineaID);
  const prefijo25 = prefijoDeServicio(tripsCsv, servicio25);

  const trips = tripsEnCurso(stopTimesCsv, lineaID, prefijo25);

  activos.forEach((a) => scene.remove(a.mesh));

  setActivos(
    trips.map((trip) => {
      const stopTimes = procesarStopTimes(stopTimesCsv, trip);

      const vaIda = esIdaParaEsteTrip(trip, tripsCsv);
      const poly = vaIda ? polyIda : polyVuelta;
      return {
        trip,
        stopTimes,
        poly,
        vaIda,
        mesh: crearBusMesh(),
      };
    })
  );
}

export function indiceEnPolyMasCercano(point, poly) {
  let best = 0;
  let bestD = Infinity;

  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i].lat - point.lat, poly[i].lon - point.lon);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function posicionGuaguaAhoraEnPoly(stopTimes, stops, poly) {
  const t = segundosSimulados;

  let idx = stopTimes.findIndex((s) => t < s.t_dep);
  if (idx <= 0) idx = 1;
  if (idx === -1) return null;

  const A = stopTimes[idx - 1];
  const B = stopTimes[idx];

  const stopA = stops[A.stop_id];
  const stopB = stops[B.stop_id];
  if (!stopA || !stopB) return null;

  const dur = B.t_dep - A.t_dep;
  const alpha = Math.max(0, Math.min(1, (t - A.t_dep) / dur));

  const ia = indiceEnPolyMasCercano(stopA, poly);
  const ib = indiceEnPolyMasCercano(stopB, poly);

  return {
    t: ia + (ib - ia) * alpha,
  };
}
