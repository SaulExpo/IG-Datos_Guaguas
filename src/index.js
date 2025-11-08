// src/index.js
import * as THREE from "three";
import {
  initScene,
  cargarMapa,
  scene,
  camera,
  renderer,
  camcontrols,
  CargaOSM,
  edificiosMesh,
  actualizarCicloDiaNoche,
  enfocarGuagua,
  enfocarParada,
} from "./scene.js";
import { cargarRutas, gruposRutas } from "./rutas.js";
import {
  cargarParadas,
  etiquetasParadas,
  gruposParadas,
  mostrarTodasLasLineas,
} from "./paradas.js";
import {
  actualizarPanelGuaguas,
  cargarDatosYCrearGuaguas,
  setDiaSimulado,
  setSegundosSimulados,
  segundosSimulados,
  activos,
  limpiarGuaguas,
} from "./tiempo.js";
import { recargarGuaguas } from "./buses.js";
import { formatoHora, horaASegundos } from "./utils.js";
import { cargarFarolas } from "./farolas.js";

export let seleccion = "all";

initScene();
CargaOSM();
cargarFarolas("src/calles_iluminadas.json");

const rutas = {
  "1-10": [1, 2, 7, 8],
  "11-20": [12, 13, 17, 20],
  "21-30": [22, 25, 26],
  "31-40": [33],
  "41-50": [48],
  "81-100": [91],
};

const selectorGrupo = document.getElementById("selectorGrupo");
const selectorRuta = document.getElementById("selectorRuta");

selectorGrupo.addEventListener("change", () => {
  const grupo = selectorGrupo.value;

  selectorRuta.innerHTML = "";

  if (grupo === "all") {
    seleccion = "all";
    mostrarTodasLasLineas();
    selectorRuta.disabled = true;
    selectorRuta.innerHTML = "<option>Mostrando todas</option>";
    return;
  }

  selectorRuta.innerHTML =
    "<option value='all' selected disabled hidden>Elige una ruta</option>";
  rutas[grupo].forEach((num) => {
    const op = document.createElement("option");
    op.value = num;
    op.textContent = `Línea ${num}`;
    selectorRuta.appendChild(op);
  });

  selectorRuta.disabled = false;
});

document
  .getElementById("selectorRuta")
  .addEventListener("change", async (e) => {
    seleccion = e.target.value;

    limpiarGuaguas();
    mostrarLoader();

    await new Promise(requestAnimationFrame);
    await cargarDatosYCrearGuaguas(seleccion);
    actualizarPanelGuaguas(activos);

    ocultarLoader();

    for (const linea in gruposRutas) {
      gruposRutas[linea].visible = linea === seleccion;
    }

    for (const linea in gruposParadas) {
      gruposParadas[linea].visible = linea === seleccion;
    }

    etiquetasParadas.forEach((et) => {
      et.div.style.display = et.lineaID === seleccion ? "block" : "none";
    });
  });

document.getElementById("selectorDia").addEventListener("change", async (e) => {
  setDiaSimulado(Number(e.target.value));
  if (seleccion != "all") {
    limpiarGuaguas();
    mostrarLoader();

    await new Promise(requestAnimationFrame);
    await cargarDatosYCrearGuaguas(seleccion);
    actualizarPanelGuaguas(activos);

    ocultarLoader();
  }
});

document.getElementById("sliderHora").addEventListener("input", async (e) => {
  document.getElementById("labelHora").value = formatoHora(
    Math.floor(Number(e.target.value))
  );
  setSegundosSimulados(Number(e.target.value));

  document.getElementById("labelHora").textContent =
    formatoHora(segundosSimulados);

  if (seleccion != "all") {
    limpiarGuaguas();
    mostrarLoader();

    await new Promise(requestAnimationFrame);
    await cargarDatosYCrearGuaguas(seleccion);
    actualizarPanelGuaguas(activos);

    ocultarLoader();
  }
});

document.getElementById("cerrarETA").addEventListener("click", () => {
  document.getElementById("panelETA").style.display = "none";
});

document.getElementById("toggleEdificios").addEventListener("click", (e) => {
  if (!edificiosMesh) return;
  edificiosMesh.visible = !edificiosMesh.visible;
  e.target.textContent = edificiosMesh.visible
    ? "Ocultar edificios"
    : "Mostrar edificios";
});

document
  .getElementById("panelGuaguasActivas")
  .addEventListener("click", (e) => {
    const card = e.target.closest(".bus");
    if (!card) return;
    const trip = card.dataset.trip;
    const bus = activos.find((a) => a.trip === trip);
    if (!bus) return;

    enfocarGuagua(bus.mesh);
  });

const slider = document.getElementById("sliderHora");
const inputHora = document.getElementById("labelHora");
inputHora.addEventListener("input", () => {
  const nuevoTiempo = horaASegundos(inputHora.value);
  setSegundosSimulados(nuevoTiempo);
  slider.value = nuevoTiempo;
  recargarGuaguas(seleccion);
});

const input = document.getElementById("inputParada");
const lista = document.getElementById("listaResultados");

input.addEventListener("input", () => {
  const texto = input.value.toLowerCase().trim();
  lista.innerHTML = "";

  if (texto.length === 0) {
    lista.style.display = "none";
    return;
  }

  let resultados;
  if (seleccion == "all") {
    resultados = etiquetasParadas
      .filter((p) => p.name)
      .filter((p) => p.name.toLowerCase().includes(texto))
      .filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i);
  } else {
    resultados = etiquetasParadas
      .filter((p) => p.name)
      .filter((p) => p.lineaID == seleccion)
      .filter((p) => p.name.toLowerCase().includes(texto))
      .filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i);
  }

  resultados.forEach((r) => {
    const item = document.createElement("div");
    item.className = "resultado-parada";
    item.textContent = r.name;
    item.onclick = () => seleccionarParada(r);
    lista.appendChild(item);
  });

  lista.style.display = resultados.length ? "block" : "none";
});

const lineas = [
  "1",
  "25",
  "26",
  "7",
  "48",
  "2",
  "91",
  "17",
  "12",
  "8",
  "13",
  "20",
  "22",
  "33",
];

cargarMapa(
  "https://raw.githubusercontent.com/SaulExpo/Practica2-IG/refs/heads/main/gran_canaria.png"
).then(() => {
  cargarRutas(
    lineas.flatMap((id) => {
      const base = colorLineaBase(id);
      return [
        {
          archivo: `Rutas/${id}/ruta_${id}_ida.json`,
          colorLinea: aclarar(base).getHex(),
        },
        {
          archivo: `Rutas/${id}/ruta_${id}_vuelta.json`,
          colorLinea: oscurecer(base).getHex(),
        },
      ];
    })
  );

  cargarParadas(
    lineas.flatMap((id) => {
      const base = colorLineaBase(id);
      const comp = colorComplementario(base);
      return [
        {
          archivo: `Rutas/${id}/paradas_${id}_ida.json`,
          colorParada: aclarar(comp).getHex(),
        },
        {
          archivo: `Rutas/${id}/paradas_${id}_vuelta.json`,
          colorParada: oscurecer(comp).getHex(),
        },
      ];
    })
  );

  animationLoop();
});

function animationLoop() {
  requestAnimationFrame(animationLoop);
  camcontrols.update();
  actualizarCicloDiaNoche();
  etiquetasParadas.forEach((e) => {
    const { div, position } = e;
    const p = position.clone().project(camera);

    if (!e.visibleForRoute) {
      div.style.display = "none";
      return;
    }

    const visible = p.z >= -1 && p.z <= 1;
    div.style.display = visible ? "block" : "none";

    if (visible) {
      div.style.left = ((p.x + 1) / 2) * window.innerWidth + "px";
      div.style.top = ((-p.y + 1) / 2) * window.innerHeight + "px";
    }
  });

  renderer.render(scene, camera);
}

export function colorLineaBase(lineaID) {
  const hue = (parseInt(lineaID) * 47) % 360;
  return new THREE.Color(`hsl(${hue}, 80%, 50%)`);
}

export function aclarar(color, porcentaje = 0.15) {
  const hsl = {};
  color.getHSL(hsl);
  hsl.l = Math.min(1, hsl.l + porcentaje);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

export function oscurecer(color, porcentaje = 0.15) {
  const hsl = {};
  color.getHSL(hsl);
  hsl.l = Math.max(0, hsl.l - porcentaje);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

export function colorComplementario(color) {
  const hsl = {};
  color.getHSL(hsl);
  hsl.h = (hsl.h + 0.5) % 1;
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function mostrarLoader() {
  document.getElementById("loader").style.display = "flex";
}

function ocultarLoader() {
  document.getElementById("loader").style.display = "none";
}

function seleccionarParada(parada) {
  lista.style.display = "none";
  input.value = parada.name;

  enfocarParada(parada.position);
}
