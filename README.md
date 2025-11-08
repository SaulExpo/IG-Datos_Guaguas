# Visualización de Guaguas en "Tiempo Real"

Este proyecto permite visualizar en **3D**, mediante **Three.js**, las rutas, paradas y guaguas utilizando datos reales (GTFS/Topología / Mapas).  
Las guaguas se muestran desplazándose según la **hora simulada**, y el usuario puede alternar líneas, enfocar puntos o cambiar el tiempo de la simulación.

---

## Estructura del Proyecto)

| Archivo | Descripción |
|--------|-------------|
| **scene.js** | Configura la escena 3D: cámara, luces, mapa base, controles y carga inicial. También maneja el ciclo día/noche y acciones de interacción (seleccionar bus o parada). |
| **index.js** | Punto de entrada del proyecto. Inicializa la escena, carga los datos y arranca el bucle de renderizado y actualización. |
| **rutas.js** | Carga, normaliza y dibuja las **rutas** de las líneas en el mapa usando líneas de Three.js. Organiza las rutas por línea. |
| **paradas.js** | Dibuja y etiqueta las **paradas**. Genera labels HTML y agrupa paradas por línea y sentido. |
| **buses.js** | Crea y actualiza los **modelos 3D de los autobuses**, animándolos a lo largo de su ruta correspondiente según el tiempo simulado. |
| **tiempo.js** | Controla el **tiempo de simulación** (velocidad, pausa, avance). Calcula qué autobuses están activos y su posición actual en la ruta. |
| **datos.js** | Procesa los archivos **GTFS** (`stops.csv`, `stop_times.csv`, `trips.csv`, `calendar.txt`) para convertirlos a estructuras utilizables por el resto del sistema. |
| **farolas.js** | Crea y distribuye **farolas / iluminación del mapa**, interpolando puntos sobre calles para colocarlas correctamente. |
| **utils.js** | Contiene funciones auxiliares: interpolación, mapeo de coordenadas lat/lon a coordenadas X/Y, parseo CSV, conversión horaria, etc. |

---

## Obtención de datos

### Base de datos de Guaguas Municipales

Para obtener los datos de las rutas de las guaguas para los diferentes archivos `csv` se ha descargado el **GTFS** del siguiente enlace:
https://mobilitydatabase.org/feeds/gtfs/tld-767

Los archivos obtenidos son los siguientes:
- `stops.csv`: Contiene el nombre de cada parada, su código y ubicación
- `stop_times.csv`: Contiene para cada guagua, su hora de llegada a una parada y salida, indicando el código de la ruta y la parada
- `trips.csv`: Contiene la ruta de cada línea con su identificador, dirección y parada final
- `calendar.txt`: Contiene el tipo de ruta de cada día de la semana

### Mapa de Las Palmas

Para obtener el mapa la web OpenStreetMap, estabeciéndo las siguientes coordenadas:
```
minlon = -15.49072265625,
maxlon = -15.3973388671875,
minlat = 28.042894772561624,
maxlat = 28.178559849396976;
```

### Rutas y paradas de las Guaguas

Para conseguir cada ruta se siguió una serie de procedimientos utilizando 2 webs:

1. Acceder a la web de OverPassTurbo
2. Incluir la siguiente consulta indicando el número de la guagua que se requiera (en este ejemplo la línea 7):
   ```
     [out:json][timeout:60];
     relation["route"="bus"]["ref"="7"]["network"="Guaguas Municipales"];
     out ids tags;
   ```
3. En la derecha aparecerán los 2 recorridos que recorre dicha línea (el de ida y el de vuelta). Copiar uno de sus **ids** y utilizar la siguiente consulta:
  ```
    [out:json][timeout:60];
    relation(ID_COPIADO);
    (._; >;);
    out geom;
  ```
4. Exportar la ruta en formato GeoJson
5. Acceder a la página web MapShaper para exportar por separado las paradas de la ruta y la línea en sí, exportando ambos archivos en formato TopoJson para reducir su tamaño.
6. Repetir los pasos del 3-5 con la ruta de vuelta.
7. Repetir todo el proceso para cada línea de guaguas municipales

### Edificios e iluminación de Las Palmas

Los últimos elementos obtenidos son los edificios y las farolas de la ciudad de Las Palmas. Para obtenerlos se utilizó de nuevo la web OverPassTurbo seleccionando en un recuadro toda la ciudad de Las Palmas y filtrando por edificios y calles iluminadas.
Se utilizó la siguiente consulta para los edificios:
```
[out:json][timeout:25];
area["name"="Las Palmas de Gran Canaria"]["boundary"="administrative"]["admin_level"="8"]->.searchArea;
(
  way["building"](area.searchArea);
  relation["building"](area.searchArea);
);
out body;
>;
out skel qt;
```

Y la siguiente para las calles iluminadas sobre las que se crearan las farolas:
```
[out:json][timeout:25];
area["name"="Las Palmas de Gran Canaria"]["boundary"="administrative"]["admin_level"="8"]->.searchArea;
way["highway"]["lit"="yes"](area.searchArea);
out body;
>;
out skel qt;
```
---

##  Funcionalidades del sistema

En esta sección se describen las principales funcionalidades implementadas en el visor 3D de guaguas, explicando cómo se visualizan, cómo se interactúa con ellas y cómo se relacionan con el tiempo simulado.

### Creación de guaguas
Las guaguas se generan a partir de la información del GTFS, y cada una corresponde a un viaje (trip) definido para un día y hora determinados. Para cada guagua:

1. Se detecta si debe estar activa en función del tiempo de simulación.
2. Se obtiene la ruta asociada a ese viaje.
3. Se interpola su posición entre paradas según la hora exacta simulada.

Cada guagua se representa como un modelo 3D ubicado sobre el mapa siguiendo su trayectoria real.

<img width="454" height="460" alt="image" src="https://github.com/user-attachments/assets/43460c23-208d-42e8-bedf-57625c8d5769" />

#### Panel de Guaguas

El sistema cuenta con un panel que permite:

- Ver cuántas guaguas están actualmente en servicio según la hora simulada.
- Resaltar en el mapa únicamente las guaguas pertenecientes a la línea seleccionada.

Este panel facilita enfocar rutas y evitar saturación visual en horas con muchas líneas activas.

<img width="310" height="430" alt="image" src="https://github.com/user-attachments/assets/d641f34c-f4bd-45f9-8221-8b2038d4eaa4" />

#### Posición "Real"

La posición de cada guagua es calculada en tiempo simulado, interpolando entre la hora de llegada y salida de cada parada definida en stop_times.csv.
Esto permite que:

- La guagua no se mueva "a saltos" entre paradas.
- La animación represente velocidades proporcionales a la distancia real recorrida.

#### Zoom a la guagua

Al seleccionar una guagua desde el panel, la cámara realiza:

- Transición suave para centrarla.
- Seguimiento opcional mientras sigue su ruta.

![chrome_fXyNvs69Dj](https://github.com/user-attachments/assets/fee9aecf-d4aa-43c0-a6e8-98c4a65be2d4)

#### Movimiento de la guagua

Las guaguas se mueven fluidamente a lo largo de polilíneas de la ruta, respetando:

- Forma de la carretera
- Velocidad relativa asociada al tiempo entre paradas
- Cambio de dirección en curvas y enlaces

![chrome_h5RsH71fmM](https://github.com/user-attachments/assets/6bb1e59c-a3a7-40ab-89fa-1420d0d23586)


### Carga de las rutas

Las rutas se cargan desde archivos TopoJSON optimizados para reducir tamaño y mejorar rendimiento.
Cada ruta:

- Se dibuja como una línea 3D sobre el mapa.
- Se colorea de forma diferente según la línea.
- Se agrupa en ida y vuelta cuando corresponda.

El usuario puede activar o desactivar la visualización de rutas desde el `select` de líneas.

<img width="813" height="821" alt="image" src="https://github.com/user-attachments/assets/0a05a4e6-cff3-430e-9e36-1c2d860a7142" />

### Carga de las paradas

Las paradas se obtienen desde stops.csv y se cruzan con las rutas para saber a qué línea y sentido pertenecen.

Se representan mediante:

- Un punto 3D para la parada.
- Un icono de una guagua en una etiqueta HTML flotante encima de la parada.

<img width="1061" height="811" alt="image" src="https://github.com/user-attachments/assets/f1e2fd30-402f-4019-8b42-b55231680d66" />

#### Dibujo de las etiquetas
Las etiquetas se posicionan dinámicamente para:

- Seguir la parada al rotar/mover la cámara.
- No aparecer cuando la parada está demasiado lejos (reduciendo ruido visual).

<img width="306" height="205" alt="image" src="https://github.com/user-attachments/assets/347d6f1e-0298-4f11-b94b-45cc2b59d765" />

#### Zoom a las paradas

Al seleccionar una parada en el buscador superior, la cámara:

- Se desplaza hacia ella.
- Muestra las líneas que pasan por dicha parada.
  
![chrome_fzueskCRol](https://github.com/user-attachments/assets/dd3f9cad-3c8f-4e8a-a7c2-469d747d0d93)

#### Panel de tiempo por parada

Al seleccionar una parada se muestra:

- Próximos tiempos de llegada de cada línea (según el tiempo simulado).
- Dirección y destino final de cada viaje.

Esto emula la experiencia de una pantalla de información de parada real.

<img width="438" height="228" alt="image" src="https://github.com/user-attachments/assets/dda1c766-d62e-4aeb-9b58-58db6b4cdb3c" />

### Modificación de tiempo

El sistema permite simular cualquier hora del día, acelerando o pausando el tiempo.

#### Modificación de hora

Se puede:

- Avanzar o retroceder en el día.
- Saltar directamente a una hora concreta (ej. 08:30).

Esto afecta inmediatamente qué guaguas están en servicio y su posición.

#### Ciclo dia y noche

La iluminación de la escena cambia automáticamente:

- Cielo más claro durante el día.
- Atardeceres y amaneceres con color naranja.
- Iluminación ambiente y farolas encendidas de noche.
- Sombra ambiental ajustada según la hora.

![chrome_Ckzo18GO59](https://github.com/user-attachments/assets/6a61b3ea-dd9a-447f-be41-aa4fb914d3c6)

#### Modificación de dia

La información del archivo calendar.txt permite activar horarios:

- Laborales
- Sábados
- Domingos / festivos
- etc.

Esto modifica los viajes disponibles al seleccionar el dia requerido.

![chrome_tZGvHoFvoW](https://github.com/user-attachments/assets/5ead0975-b671-43f8-8f02-2efc013b2ed8)

### Carga de los edificios

Los edificios extraídos del fichero `edificios.json` se dibujan como volúmenes 3D, con:

- Altura aproximada derivada de datos OSM o asignada por tipo.
- Sombreado según la iluminación solar simulada.

Permite una referencia visual clara de la ciudad.

<img width="844" height="658" alt="image" src="https://github.com/user-attachments/assets/a2738540-29e7-4352-b882-e8a4787d9764" />

### Carga de las farolas

Las farolas se generan interpolando puntos regulares sobre las calles marcadas como iluminadas en OSM.
Cada farola es una pequeña fuente de luz puntual, contribuyendo al efecto nocturno realista.

<img width="1043" height="640" alt="image" src="https://github.com/user-attachments/assets/b9b33eb3-417a-4616-8416-d95df5d750d9" />

---

## Vídeo de demostración

