// src/scene.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { horaASegundos, formatoHora } from "./utils.js";
import { activos, segundosSimulados } from "./tiempo.js";
import { crearBusMesh, setModeloGuagua } from "./buses.js";
import { gruposParadas, mostrarTodasLasLineas } from "./paradas.js";
import * as topojson from "topojson-client";

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
export let scene, camera, renderer, camcontrols;
export let mapa, mapsx, mapsy;
export let edificiosMesh = null;
export const sun = new THREE.DirectionalLight(0xffffff, 1.2);
export const ambient = new THREE.AmbientLight(0xffffff, 0.5);
export let farolasMesh = null;
export let farolasCount = 0;

export const minlon = -15.49072265625,
  maxlon = -15.3973388671875,
  minlat = 28.042894772561624,
  maxlat = 28.178559849396976;

window.addEventListener("pointerdown", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const objetos = Object.values(gruposParadas)
    .map((g) => g.children)
    .flat();

  const intersects = raycaster.intersectObjects(objetos);

  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj.userData.onClick) obj.userData.onClick();
  }
});

export function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    500
  );

  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

  sun.position.set(0, 1, 1);
  sun.position.set(0, 0, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

  scene.add(ambient);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = THREE.ReinhardToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  camcontrols = new OrbitControls(camera, renderer.domElement);

  camcontrols.screenSpacePanning = true;
  camcontrols.enableRotate = false;
  camcontrols.enablePan = true;
  camcontrols.enableZoom = true;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const loader = new GLTFLoader();
  loader.load("models/guagua.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.03, 0.03, 0.03);

    setModeloGuagua(model);

    const wait = setInterval(() => {
      if (activos && activos.length > 0) {
        activos.forEach((a) => {
          scene.remove(a.mesh);
          a.mesh = crearBusMesh();
        });
        clearInterval(wait);
      }
    }, 200);

    const slider = document.getElementById("sliderHora");
    const inputHora = document.getElementById("labelHora");

    if (slider && inputHora) {
      slider.value = horaASegundos(new Date().toTimeString().substring(0, 8));
      inputHora.value = formatoHora(Math.floor(segundosSimulados));
    }
    mostrarTodasLasLineas();
  });
}

export function cargarMapa(url, scale = 15) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (texture) => {
      const aspect = texture.image.width / texture.image.height;
      mapsy = scale;
      mapsx = mapsy * aspect;

      const geometry = new THREE.PlaneGeometry(mapsx, mapsy);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1.0,
        metalness: 0.0,
      });

      mapa = new THREE.Mesh(geometry, material);
      mapa.receiveShadow = true;
      scene.add(mapa);

      resolve();
    });
  });
}

export function CargaOSM() {
  fetch("src/edificios.json")
    .then((r) => r.json())
    .then((topo) => {
      const layerName = Object.keys(topo.objects)[0];
      const geo = topojson.feature(topo, topo.objects[layerName]);

      const grupo = new THREE.Group();
      grupo.visible = false;

      geo.features.forEach((f) => {
        if (!f.geometry || f.geometry.type !== "Polygon") return;

        const coords = f.geometry.coordinates[0].map(([lon, lat]) => ({
          x: Map2Range(lon, minlon, maxlon, -mapsx / 2, mapsx / 2),
          y: Map2Range(lat, minlat, maxlat, -mapsy / 2, mapsy / 2),
        }));

        const shape = new THREE.Shape();
        coords.forEach((p, i) =>
          i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)
        );

        const niveles = parseFloat(f.properties["building:levels"]) || 2;
        const altura = niveles * 0.01;

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
        mesh.castShadow = true;

        grupo.add(mesh);
      });

      scene.add(grupo);
      edificiosMesh = grupo;
    });
}

function Map2Range(val, vmin, vmax, dmin, dmax) {
  let t = 1 - (vmax - val) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

export function actualizarCicloDiaNoche() {
  const s = segundosSimulados;

  const horas = (s / 3600) % 24;
  const t = horas / 24;
  let esDia;
  if (horas >= 20 || horas < 6) {
    // NOCHE
    esDia = false;
    sun.color.set("#9bbcff");
    sun.intensity = 0.05;
    ambient.intensity = 0.15;
    ambient.color.set("#4a6fa5");
    if (window.farolasMesh) {
      window.farolasMesh.visible = true;
    }
  } else if (horas < 8) {
    // AMANECER
    esDia = false;
    sun.color.set("#ffcf8b");
    sun.intensity = (horas - 6) / 2;
    ambient.intensity = 0.2 + (horas - 6) * 0.1;
  } else if (horas > 18 && horas < 20) {
    // ATARDECER
    esDia = false;
    sun.color.set("#ff9c5b");
    sun.intensity = (20 - horas) / 2;
    ambient.intensity = 0.4 + (20 - horas) * 0.1;
  } else {
    esDia = true;
    sun.color.set("#ffffff");
    sun.intensity = 2;
    ambient.intensity = 1;
    ambient.color.set("#ffffff");
    if (window.farolasMesh) {
      window.farolasMesh.visible = false;
    }
  }

  const ang = (s / 86400) * Math.PI * 2;
  sun.position.set(Math.cos(ang) * 100, Math.sin(ang) * 100, 80);
  sun.lookAt(0, 0, 0);
}

export function enfocarGuagua(mesh) {
  const busPos = mesh.position.clone();

  const altura = 0.5;

  const destinoCam = new THREE.Vector3(busPos.x, busPos.y, altura);

  const destinoTarget = new THREE.Vector3(busPos.x, busPos.y, 0);

  const origenCam = camera.position.clone();
  const origenTarget = camcontrols.target.clone();

  let t = 0;

  function anim() {
    t += 0.04;

    camera.position.lerpVectors(origenCam, destinoCam, t);

    camcontrols.target.lerpVectors(origenTarget, destinoTarget, t);

    camcontrols.update();

    if (t < 1) requestAnimationFrame(anim);
  }

  anim();
}

export function enfocarParada(paradaPos) {
  const altura = 0.5;

  const destinoCam = new THREE.Vector3(paradaPos.x, paradaPos.y, altura);

  const destinoTarget = new THREE.Vector3(paradaPos.x, paradaPos.y, 0);

  const origenCam = camera.position.clone();
  const origenTarget = camcontrols.target.clone();

  let t = 0;

  function anim() {
    t += 0.04;

    camera.position.lerpVectors(origenCam, destinoCam, t);

    camcontrols.target.lerpVectors(origenTarget, destinoTarget, t);

    camcontrols.update();

    if (t < 1) requestAnimationFrame(anim);
  }

  anim();
}
