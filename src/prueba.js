import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let scene, renderer;
let camera;
let camcontrols;
let objetos = [];

const gruposRutas = {}; // { "25": THREE.Group, "26": THREE.Group, ... }
const gruposParadas = {}; // { "25": THREE.Group, "26": THREE.Group, ... }

let nodes = [],
  ways = [],
  relations = [];
// Latitud y longitud de los extremos del mapa (textura))
let minlon = -15.479736328125,
  maxlon = -15.347900390625;
let minlat = 27.780771643348217,
  maxlat = 28.18824364185029;
let mapa,
  mapsx,
  mapsy,
  scale = 15;
let t0;
let buses = {};
const rutasGeom = {};
let vaIda, vaVuelta;
let stops;
let pendingParadas = [];
let stopsIda = [];
let stopsVuelta = [];

let modeloGuagua = null;
let activos;
let baseRotation;
let diaSimulado = null;
let segundosSimulados = null;
let velocidadTiempo = 1; // 1 = tiempo real, 60 = cada segundo avanza 1 minuto, etc.
let ultimoFrame = Date.now(); // para medir tiempo entre frames

let indicesIda = {};
let indicesVuelta = {};
let etiquetasParadas = [];
let calendar, tripsCsv, stopTimesCsv, polyIda, polyVuelta;

init();
document.getElementById("selectorRuta").addEventListener("change", (e) => {
  const seleccion = e.target.value;

  for (const linea in gruposRutas) {
    gruposRutas[linea].visible = seleccion === "" || seleccion === linea;
  }

  for (const linea in gruposParadas) {
    gruposParadas[linea].visible = seleccion === "" || seleccion === linea;
  }
  etiquetasParadas.forEach(({ div, lineaID: id }) => {
    div.style.display = seleccion === "" || seleccion === id ? "block" : "none";
  });
});

document.getElementById("selectorDia").addEventListener("change", (e) => {
  diaSimulado = e.target.value === "" ? null : Number(e.target.value);
  console.log("📅 Día simulado cambiado a:", diaSimulado);

  recargarGuaguas(); // 👈 función para regenerar trips y activos
});

document.getElementById("sliderHora").addEventListener("input", (e) => {
  segundosSimulados = Number(e.target.value);

  document.getElementById("labelHora").textContent =
    formatoHora(segundosSimulados);

  recargarGuaguas(); // recalcular cuáles guaguas están activas en esta hora
});

animationLoop();

Promise.all([
  fetch("src/stops.txt").then((r) => r.text()),
  fetch("src/stop_times.txt").then((r) => r.text()),
  fetch("src/calendar.txt").then((r) => r.text()),
  fetch("src/trips.txt").then((r) => r.text()), // ← NUEVO
  cargarRutaGeom("Rutas/25/ruta_25_ida.json"),
  cargarRutaGeom("Rutas/25/ruta_25_vuelta.json"),
]).then(
  ([
    stopsCsv,
    stopTimesCsvLocal,
    calendarCsvLocal,
    tripsCsvLocal,
    polyIdaLocal,
    polyVueltaLocal,
  ]) => {
    stopTimesCsv = stopTimesCsvLocal;
    tripsCsv = tripsCsvLocal;
    polyIda = polyIdaLocal;
    polyVuelta = polyVueltaLocal;
    console.log("✅ Ruta 25 ida puntos:", polyIda.length);
    console.log("✅ Ruta 25 vuelta puntos:", polyVuelta.length);

    stops = procesarStops(stopsCsv);
    indicesIda = precalcularIndices(polyIda, stops);
    indicesVuelta = precalcularIndices(polyVuelta, stops);
    pendingParadas.forEach(({ lineaID, stopID, x, y, z }) => {
      if (!stopID || !stops[stopID]) return;

      const etiqueta = crearEtiquetaHTML(stops[stopID].name, x, y, z + 0.02);
      etiqueta.lineaID = lineaID;
      etiquetasParadas.push(etiqueta);
    });

    console.log("✅ Etiquetas de paradas añadidas:", pendingParadas.length);
    calendar = procesarCalendar(calendarCsvLocal);
    const servicio25 = servicioCorrectoParaLinea(calendar, tripsCsv, "25");
    const prefijo25 = prefijoDeServicio(tripsCsv, servicio25);

    console.log(
      "🗓 Hoy para la línea 25 opera:",
      servicio25,
      "→ prefijo:",
      prefijo25
    );

    const trips = tripsEnCurso(stopTimesCsv, "25", prefijo25);

    console.log(
      trips.map((trip) => {
        const st = procesarStopTimes(stopTimesCsv, trip);
        return {
          trip,
          inicio: st[0].t_dep,
          fin: st[st.length - 1].t_arr,
        };
      })
    );

    // Para CADA guagua, decidir si va en ida o en vuelta:
    activos = trips.map((trip) => {
      const stopTimes = procesarStopTimes(stopTimesCsv, trip);
      console.log(stopTimes);

      const vaIda = esIdaParaEsteTrip(stopTimes, stopsIda, stopsVuelta);
      const poly = vaIda ? polyIda : polyVuelta;

      setInterval(() => {
        // tiempo real transcurrido entre frames
        const ahora = Date.now();
        const delta = (ahora - ultimoFrame) / 1000; // en segundos
        ultimoFrame = ahora;

        // ⏱️ avanzar tiempo simulado si está activo
        if (segundosSimulados != null) {
          segundosSimulados += delta * velocidadTiempo;
          if (segundosSimulados > 86400) segundosSimulados -= 86400; // vuelta al día siguiente

          document.getElementById("sliderHora").value = segundosSimulados;
          document.getElementById("labelHora").textContent = formatoHora(
            Math.floor(segundosSimulados)
          );
        }
        if (!activos) return;

        activos.forEach(({ stopTimes, poly, mesh }) => {
          const pos = posicionGuaguaAhora(stopTimes, stops, poly);
          if (pos) actualizarPosicionBus(mesh, pos, poly);
        });

        actualizarPanelGuaguas(activos);
      }, 200);

      return {
        trip,
        stopTimes,
        poly,
        vaIda,
        mesh: crearBusMesh(),
      };
    });
  }
);

function init() {
  //Defino cámara
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    20,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 10);

  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(0, 0, 100);

  sun.castShadow = true; // ← esto faltaba
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;

  scene.add(sun);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true; // ← activar sombras
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // ← sombras suaves
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const loader = new GLTFLoader();

  // cargar el modelo solo una vez
  loader.load("models/guagua.glb", (gltf) => {
    baseRotation = new THREE.Quaternion();
    modeloGuagua = gltf.scene;
    modeloGuagua.scale.set(0.03, 0.03, 0.03);

    // ✅ Esperamos hasta que existan guaguas
    const wait = setInterval(() => {
      if (activos && activos.length > 0) {
        console.log("✅ Modelo cargado → Reemplazando esferas por guaguas");

        activos.forEach((a) => {
          scene.remove(a.mesh);
          a.mesh = crearBusMesh();
        });

        clearInterval(wait);
      }
    }, 200);

    sliderHora.value = horaASegundos(new Date().toTimeString().substring(0, 8));
    labelHora.textContent = new Date().toTimeString().substring(0, 8);

    console.log("✅ Modelo aplicado a todas las guaguas");
  });
  //CARGA TEXTURA (MAPA)
  //Crea plano, ajustando su tamaño al de la textura, manteniendo relación de aspecto
  const tx1 = new THREE.TextureLoader().load(
    "https://i.imgur.com/LnxBVrZ.jpeg",

    // Acciones a realizar tras la carga
    function (texture) {
      //Objeto sobre el que se mapea la textura del mapa
      //Plano para mapa manteniendo proporciones de la textura de entrada
      const txaspectRatio = texture.image.width / texture.image.height;
      mapsy = scale;
      mapsx = mapsy * txaspectRatio;
      Plano(0, 0, 0, mapsx, mapsy);
      console.log("Dimensiones  " + mapsx + ", " + mapsy);
      //Dimensiones, textura
      //console.log(texture.image.width, texture.image.height);
      mapa.material.map = texture;
      mapa.material.needsUpdate = true;

      //Necesita tener la textura cargada para proceder con colocación objetos
      //CargaOSM();
      CargaRutas([
        {
          archivo: "Rutas/25/ruta_25_ida.json",
          colorLinea: 0x0077ff,
        },
        {
          archivo: "Rutas/25/ruta_25_vuelta.json",
          colorLinea: 0xff9900,
        },
        {
          archivo: "Rutas/26/ruta_26_ida.json",
          colorLinea: 0x0000ff,
        },
        {
          archivo: "Rutas/26/ruta_26_vuelta.json",
          colorLinea: 0xff99ee,
        },
        {
          archivo: "Rutas/7/ruta_7_ida.json",
          colorLinea: 0x0000ff,
        },
        {
          archivo: "Rutas/7/ruta_7_vuelta.json",
          colorLinea: 0xff99ee,
        },
      ]);
      CargaParadas([
        { archivo: "Rutas/25/paradas_25_ida.json", colorParada: 0xff0000 },
        { archivo: "Rutas/25/paradas_25_vuelta.json", colorParada: 0x00bb00 },
        { archivo: "Rutas/26/paradas_26_ida.json", colorParada: 0xff0000 },
        { archivo: "Rutas/26/paradas_26_vuelta.json", colorParada: 0x00bb00 },
        { archivo: "Rutas/7/paradas_7_ida.json", colorParada: 0xff0000 },
        { archivo: "Rutas/7/paradas_7_vuelta.json", colorParada: 0x00bb00 },
      ]);
    }
  );

  //OrbitControls
  //camcontrols = new OrbitControls(camera, renderer.domElement);
  //TrackballControls
  camcontrols = new TrackballControls(camera, renderer.domElement);

  t0 = new Date();
}

import * as topojson from "topojson-client";

function CargaOSM() {
  fetch("src/edificios.json") // ruta a tu TopoJSON
    .then((r) => r.json())
    .then((topo) => {
      const layerName = Object.keys(topo.objects)[0]; // normalmente "edificios"
      const geo = topojson.feature(topo, topo.objects[layerName]);

      geo.features.forEach((f) => {
        if (!f.geometry || f.geometry.type !== "Polygon") return;

        // Convertimos coordenadas lon/lat → mapa (x,y)
        const coords = f.geometry.coordinates[0].map(([lon, lat]) => {
          let x = Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
          let y = Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2);
          return { x, y };
        });

        const shape = new THREE.Shape();
        coords.forEach((p, i) =>
          i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)
        );

        // Altura realista (ajusta aquí)
        const niveles = parseFloat(f.properties["building:levels"]) || 2;
        const altura = niveles * 0.01; // antes 0.02, ahora más pequeño

        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: altura,
          bevelEnabled: false,
        });

        const material = new THREE.MeshStandardMaterial({
          color: 0xaaaaaa,
          metalness: 0.2,
          roughness: 0.9,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = 0;

        mesh.castShadow = true; // ✅ proyectan sombra
        mesh.receiveShadow = false; // ✅ NO reciben sombra (más limpio)

        scene.add(mesh);
      });

      console.log("✅ Edificios cargados:", geo.features.length);
    });
}

//Dados los límites del mapa del latitud y longitud, mapea posiciones en ese rango
//valor, rango origen, rango destino
function Map2Range(val, vmin, vmax, dmin, dmax) {
  //Normaliza valor en el rango de partida, t=0 en vmin, t=1 en vmax
  let t = 1 - (vmax - val) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

function Esfera(px, py, pz, radio, nx, ny, col) {
  let geometry = new THREE.SphereBufferGeometry(radio, nx, ny);
  let material = new THREE.MeshBasicMaterial({});

  let mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  scene.add(mesh);
  objetos.push(mesh);
}

function Plano(px, py, pz, sx, sy) {
  let geometry = new THREE.PlaneBufferGeometry(sx, sy);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  let mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);

  mesh.receiveShadow = true; // ✅ El plano recibe sombra, no emite

  scene.add(mesh);
  mapa = mesh;
}

//Bucle de animación
function animationLoop() {
  requestAnimationFrame(animationLoop);

  camcontrols.update();
  if (etiquetasParadas.length > 0) {
    etiquetasParadas.forEach(({ div, position }) => {
      const screen = position.clone().project(camera);
      div.style.left = ((screen.x + 1) / 2) * window.innerWidth + "px";
      div.style.top = ((-screen.y + 1) / 2) * window.innerHeight + "px";
    });
  }

  renderer.render(scene, camera);
}

function CargaRutas(listaRutas) {
  listaRutas.forEach((ruta) => {
    const lineaID = ruta.archivo.split("/")[1]; // "25", "26", "7"

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
        } else geo = data;

        geo.features.forEach((f) => {
          // --- LINEAS ---
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

              // ✅ Guardamos la geometría real de la ruta
              if (!rutasGeom[lineaID]) rutasGeom[lineaID] = [];
              rutasGeom[lineaID].push(
                coords.map(([lon, lat]) => ({ lon, lat }))
              );

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

function cargarRutaGeom(archivo) {
  return fetch(archivo)
    .then((r) => r.json())
    .then((data) => {
      let geo;
      if (data.type === "Topology") {
        const nombre = Object.keys(data.objects)[0];
        geo = topojson.feature(data, data.objects[nombre]);
      } else geo = data;

      const coords = [];

      geo.features.forEach((f) => {
        if (f.geometry.type === "LineString") {
          f.geometry.coordinates.forEach(([lon, lat]) =>
            coords.push({ lon, lat })
          );
        }
        if (f.geometry.type === "MultiLineString") {
          f.geometry.coordinates.forEach((linea) =>
            linea.forEach(([lon, lat]) => coords.push({ lon, lat }))
          );
        }
      });

      return coords; // ✅ Devuelve TODA la poly COMPLETA
    });
}

function CargaParadas(listaParadas) {
  listaParadas.forEach((paradaInfo) => {
    const lineaID = paradaInfo.archivo.split("/")[1]; // "25", "26", "7"

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
            f.properties &&
            (f.properties.highway === "bus_stop" ||
              f.properties.public_transport === "platform" ||
              f.properties.public_transport === "stop_position")
          ) {
            // ✅ Recuperamos lon/lat aquí
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

            gruposParadas[lineaID].add(marker);

            // ✅ Guardamos para etiquetar más tarde
            const stopID = f.properties.ref;
            pendingParadas.push({
              lineaID,
              stopID,
              x: marker.position.x,
              y: marker.position.y,
              z: marker.position.z,
            });
            if (lineaID === "25") {
              if (paradaInfo.archivo.includes("_ida")) stopsIda.push(stopID);
              else stopsVuelta.push(stopID);
            }
          }
        });

        console.log(`✅ Paradas cargadas para línea ${lineaID}`);
      });
  });
}

function interpolar(a, b, t) {
  return a + (b - a) * t;
}

function interpolarCoordenadas(a, b, t) {
  return {
    lat: interpolar(a.lat, b.lat, t),
    lon: interpolar(a.lon, b.lon, t),
  };
}

// stopTimes = lista de {stop_id,t_arr,t_dep,...}
// stops = diccionario { stop_id:{lat,lon} }
function posicionGuaguaAhora(stopTimes, stops, poly) {
  let s;
  if (segundosSimulados != null) {
    s = segundosSimulados; // usar hora simulada
  } else {
    const ahora = new Date();
    s = ahora.getHours() * 3600 + ahora.getMinutes() * 60 + ahora.getSeconds();
  }

  for (let i = 0; i < stopTimes.length - 1; i++) {
    const A = stopTimes[i];
    const B = stopTimes[i + 1];

    if (s >= A.t_dep && s <= B.t_arr) {
      const t = (s - A.t_dep) / (B.t_arr - A.t_dep);

      const stopA = stops[A.stop_id];
      const stopB = stops[B.stop_id];

      // Buscar puntos de referencia dentro de la poly real
      const idxA =
        indicesIda[A.stop_id] !== undefined
          ? indicesIda[A.stop_id]
          : indicesVuelta[A.stop_id];

      const idxB =
        indicesIda[B.stop_id] !== undefined
          ? indicesIda[B.stop_id]
          : indicesVuelta[B.stop_id];

      if (idxA === -1 || idxB === -1 || idxA >= idxB) {
        return interpolarCoordenadas(stopA, stopB, t); // fallback if needed
      }

      let inicio = idxA;
      let fin = idxB;

      if (fin < inicio) {
        // 🚍 Estamos en VUELTA → intercambiamos
        [inicio, fin] = [fin, inicio];
      }

      const subTramo = poly.slice(inicio, fin + 1);
      return puntoEnRuta(subTramo, t);
    }
  }
  return null;
}

// Convierte "HH:MM:SS" → segundos desde medianoche
function horaASegundos(hora) {
  const [h, m, s] = hora.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

// 1) Cargar stops.txt -> diccionario { stop_id: {lat, lon} }
function procesarStops(csv) {
  const lines = csv.trim().split("\n");
  lines.shift(); // eliminar encabezado si lo hubiera, da igual si no existe

  const stops = {};

  lines.forEach((l) => {
    const c = splitCSV(l);

    const stop_id = c[0];
    const name = c[2];
    const lat = parseFloat(c[4]);
    const lon = parseFloat(c[5]);

    // Ignorar líneas inválidas
    if (!stop_id || isNaN(lat) || isNaN(lon)) return;

    stops[stop_id] = { lat, lon, name };
  });
  console.log("Ejemplo línea cruda:", lines[10]);
  console.log("Resultado split:", splitCSV(lines[10]));

  return stops;
}

function splitCSV(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// 2) Cargar stop_times.txt -> lista de entradas para cada trip ordenadas por secuencia
function procesarStopTimes(csv, tripID) {
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

function tripsEnCurso(stopTimesCsv, lineNumber, prefijo) {
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

function puntoEnRuta(poly, t) {
  // Calculamos longitudes acumuladas
  const dist = [0];
  let total = 0;

  for (let i = 1; i < poly.length; i++) {
    const dx = poly[i].lon - poly[i - 1].lon;
    const dy = poly[i].lat - poly[i - 1].lat;
    const d = Math.sqrt(dx * dx + dy * dy);
    total += d;
    dist.push(total);
  }

  const objetivo = total * t;

  // Buscar segmento donde cae la distancia objetivo
  for (let i = 1; i < dist.length; i++) {
    if (objetivo <= dist[i]) {
      const localT = (objetivo - dist[i - 1]) / (dist[i] - dist[i - 1]);
      return {
        lon: poly[i - 1].lon + (poly[i].lon - poly[i - 1].lon) * localT,
        lat: poly[i - 1].lat + (poly[i].lat - poly[i - 1].lat) * localT,
      };
    }
  }

  return poly[poly.length - 1];
}

function crearBusMesh() {
  if (!modeloGuagua) {
    // Si el modelo aún no ha cargado, usar una esfera temporal
    const temp = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffaa44 })
    );
    temp.castShadow = true;
    scene.add(temp);
    return temp;
  }

  const bus = modeloGuagua.clone();
  bus.castShadow = true;

  bus.rotation.x = -Math.PI / 2;
  bus.rotation.z = Math.PI;

  baseRotation.copy(bus.quaternion);

  bus.position.set(0, 0, 0.1);
  scene.add(bus);
  return bus;
}

function actualizarPosicionBus(mesh, pos, poly) {
  const x = Map2Range(pos.lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
  const y = Map2Range(pos.lat, minlat, maxlat, -mapsy / 2, mapsy / 2);

  mesh.position.set(x, y, 0.1);

  // ⭐ Encontrar punto más cercano en la polyline
  const idx = puntoMasCercanoEnRuta(pos, poly);

  if (idx < poly.length - 1) {
    const siguiente = poly[idx + 1];

    const x2 = Map2Range(siguiente.lon, minlon, maxlon, -mapsx / 2, mapsx / 2);
    const y2 = Map2Range(siguiente.lat, minlat, maxlat, -mapsy / 2, mapsy / 2);

    // ⭐ Aquí sí funciona el lookAt
    // Dirección hacia el siguiente punto en el mapa
    let direccion = new THREE.Vector3(x2 - x, y2 - y, 0);
    direccion.normalize();

    // Creamos la orientación hacia esa dirección
    let targetQuat = new THREE.Quaternion();
    targetQuat.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direccion);
    // ↑ Ajusta "0,1,0" si tu modelo apunta hacia otro eje

    // ✅ Combinamos orientación de movimiento + orientación base del modelo
    if (baseRotation) {
      mesh.quaternion.copy(targetQuat.clone().multiply(baseRotation));
    }
  }
}

function indiceMasCercano(poly, stop) {
  let idx = 0,
    best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i].lat - stop.lat, poly[i].lon - stop.lon);
    if (d < best) (best = d), (idx = i);
  }
  return idx;
}

function esIda(stop, polyIda, polyVuelta) {
  function distanciaAlInicio(poly, stop) {
    const p0 = poly[0];
    return Math.hypot(p0.lat - stop.lat, p0.lon - stop.lon);
  }

  const dIda = distanciaAlInicio(polyIda, stop);
  const dVuelta = distanciaAlInicio(polyVuelta, stop);

  return dIda < dVuelta;
}

function procesarCalendar(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines.shift().split(",");

  const service_id = headers.indexOf("service_id");
  const coldays = {
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
    map[c[service_id]] = {
      monday: Number(c[coldays.monday]),
      tuesday: Number(c[coldays.tuesday]),
      wednesday: Number(c[coldays.wednesday]),
      thursday: Number(c[coldays.thursday]),
      friday: Number(c[coldays.friday]),
      saturday: Number(c[coldays.saturday]),
      sunday: Number(c[coldays.sunday]),
    };
  });

  return map; // { LA:{mon:1,tue:1,...}, SA:{...}, ... }
}

function serviceIDHoy(calendar) {
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

  // Buscamos el primer service_id cuyo día tenga 1
  for (const id in calendar) {
    if (calendar[id][dia] === 1) return id;
  }

  return null; // si no hay ninguno definido
}

function obtenerMapeoServiceTrips(tripsCsv) {
  const lines = tripsCsv.trim().split("\n");
  const headers = lines.shift().split(",");

  const colRoute = headers.indexOf("route_id");
  const colServ = headers.indexOf("service_id");
  const colTrip = headers.indexOf("trip_id");

  const map = {}; // service_id → prefijo en trip_id

  lines.forEach((line) => {
    const c = line.split(",");

    const service = c[colServ]; // Ej: "SDF"
    const trip_id = c[colTrip]; // Ej: "SDF0250001"

    if (!service || !trip_id) return;

    // Prefijo = letras iniciales del trip_id (SDF, LA, FE, LS…)
    const prefijo = trip_id.match(/^[A-Za-z]+/)[0];

    map[service] = prefijo;
  });

  return map;
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

function servicioCorrectoParaLinea(calendar, tripsCsv, routeID) {
  const activosHoy = servicesActivosHoy(calendar);
  const usadosPorLinea = serviciosDeLinea(tripsCsv, routeID);
  return activosHoy.find((id) => usadosPorLinea.includes(id)) || null;
}

function prefijoDeServicio(tripsCsv, service_id) {
  const lines = tripsCsv.trim().split("\n");
  const headers = lines.shift().split(",");
  const colServ = headers.indexOf("service_id");
  const colTrip = headers.indexOf("trip_id");

  for (const l of lines) {
    const c = l.split(",");
    if (c[colServ] === service_id) {
      return c[colTrip].match(/^[A-Za-z]+/)[0]; // Ej: "SDF"
    }
  }
  return null;
}

function procesarStopTimes(csv, tripID) {
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

function formatoHora(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function actualizarPanelGuaguas(activos) {
  const panel = document.getElementById("panelGuaguasActivas");
  panel.innerHTML = ""; // limpiar

  activos.forEach(({ trip, stopTimes, poly }) => {
    const info = infoSiguienteParada(stopTimes);
    if (!info) return;

    const vaIda = esIdaParaEsteTrip(stopTimes, stopsIda, stopsVuelta);
    const sentido = vaIda ? "➡️ IDA" : "⬅️ VUELTA";

    const div = document.createElement("div");
    div.className = "bus";
    div.innerHTML = `
      <strong>Guagua: ${trip}</strong><br>
      Sentido: ${sentido}<br>
      Próx. parada: ${stops[info.siguienteParada].name}<br>
      Llega a las: ${formatoHora(info.llegadaEstimada)}
    `;
    panel.appendChild(div);
  });
}

function crearEtiquetaHTML(texto, x, y, z) {
  const div = document.createElement("div");
  div.className = "label-parada";
  div.textContent = texto;

  Object.assign(div.style, {
    position: "absolute",
    padding: "3px 6px",
    background: "rgba(0,0,0,0.5)",
    borderRadius: "4px",
    whiteSpace: "nowrap",
    transform: "translate(-50%, -50%)",
  });

  document.getElementById("etiquetas").appendChild(div);

  return {
    div,
    position: new THREE.Vector3(x, y, z),
  };
}

function esIdaParaEsteTrip(stopTimes, stopsIda, stopsVuelta) {
  let matchIda = 0;
  let matchVuelta = 0;

  stopTimes.forEach((st) => {
    if (stopsIda.includes(st.stop_id)) matchIda++;
    if (stopsVuelta.includes(st.stop_id)) matchVuelta++;
  });

  return matchIda >= matchVuelta; // si coincide más con ida → es ida
}

function puntoMasCercanoEnRuta(pos, poly) {
  let minDist = Infinity;
  let idx = 0;

  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i].lat - pos.lat, poly[i].lon - pos.lon);
    if (d < minDist) {
      minDist = d;
      idx = i;
    }
  }

  return idx;
}

function recargarGuaguas() {
  const servicio25 = servicioCorrectoParaLinea(calendar, tripsCsv, "25");
  const prefijo25 = prefijoDeServicio(tripsCsv, servicio25);
  console.log(prefijo25);

  const trips = tripsEnCurso(stopTimesCsv, "25", prefijo25);

  // Eliminar buses antiguos
  activos.forEach((a) => scene.remove(a.mesh));

  // Crear nuevos buses
  activos = trips.map((trip) => {
    const stopTimes = procesarStopTimes(stopTimesCsv, trip);
    const vaIda = esIdaParaEsteTrip(stopTimes, stopsIda, stopsVuelta);
    const poly = vaIda ? polyIda : polyVuelta;

    return {
      trip,
      stopTimes,
      poly,
      vaIda,
      mesh: crearBusMesh(),
    };
  });

  console.log("♻️ Guaguas recargadas:", activos.length);
}

function precalcularIndices(poly, stops) {
  const mapa = {};
  for (const id in stops) {
    mapa[id] = indiceMasCercano(poly, stops[id]);
  }
  return mapa;
}
