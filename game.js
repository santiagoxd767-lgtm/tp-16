/* =====================================================
   BUG RUNNER - IPET 249 (Informática)
   Juego arcade 2D en JavaScript Vanilla + HTML5 Canvas
   Estilo: salto de un solo botón (tipo dino de Chrome / Geometry Dash)
   ===================================================== */

// ---------- 1. CONFIGURACIÓN GENERAL ----------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const W = canvas.width;    // 800
const H = canvas.height;   // 300
const SUELO = 250;         // coordenada Y donde está el piso

// Paleta institucional IPET 249
const COLOR = {
  bordo: "#6b1020",
  bordoOscuro: "#2a0710",
  amarillo: "#f2c230",
  rojo: "#d63232",
  blanco: "#ffffff",
};

// Física (valores en píxeles y segundos)
const GRAVEDAD = 2400;        // px/s²  (aceleración hacia abajo)
const IMPULSO_SALTO = -780;   // px/s   (velocidad inicial hacia arriba)
const VEL_INICIAL = 380;      // px/s   (velocidad del escenario)
const VEL_MAXIMA = 760;

// Cada cuántos puntos cambia entre día y noche
const PUNTOS_CAMBIO_DIA_NOCHE = 500;

// Estados lógicos del juego
const ESTADO = { MENU: "menu", JUGANDO: "jugando", GAME_OVER: "gameover" };
let estado = ESTADO.MENU;

// ---------- 2. RECURSOS (assets) ----------
const escudo = new Image();
let escudoCargado = false;
escudo.onload = () => { escudoCargado = true; };
escudo.src = "assets/escudo.png";

// Sonidos generados por código (WebAudio), no necesitan archivos
let audioCtx = null;
function sonido(frecuencia, duracion, tipo = "square") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    vol.gain.value = 0.05;
    osc.connect(vol);
    vol.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duracion);
  } catch (e) { /* si el navegador bloquea el audio, el juego sigue igual */ }
}

// ---------- 3. VARIABLES DEL JUEGO ----------
// Jugador: posición (x, y), velocidad (vx, vy) y tamaño
const jugador = { x: 70, y: SUELO - 44, w: 40, h: 44, vx: 0, vy: 0, enSuelo: true };

let obstaculos = [];
let memorias = [];       // coleccionables: memoria RAM (+10 puntos)
let velocidad = VEL_INICIAL;
let puntaje = 0;
let record = Number(localStorage.getItem("bugrunner_record")) || 0;
let nuevoRecord = false;
let distanciaHastaSpawn = 0;
let tiempo = 0;          // segundos desde que arrancó la partida (para animaciones)
let tiempoGameOver = 0;
let desplazamiento = 0;  // cuánto se "movió" el escenario (para el parallax)

// Ciclo día/noche: 0 = día completo, 1 = noche completa (cambia suavemente)
let noche = 0;
// Parpadeo del puntaje cada 100 puntos
let ultimoHito = 0;
let tiempoParpadeo = 0;

// Decoración: nubes, estrellas y piedritas del piso
const nubes = [
  { x: 100, y: 60, w: 52 }, { x: 330, y: 95, w: 44 },
  { x: 560, y: 50, w: 56 }, { x: 760, y: 110, w: 40 },
];
const estrellas = [];
for (let i = 0; i < 30; i++) {
  estrellas.push({ x: Math.random() * W, y: 15 + Math.random() * 150, fase: Math.random() * 6 });
}
const piedras = [];
for (let i = 0; i < 40; i++) {
  piedras.push({ x: Math.random() * (W + 100), y: SUELO + 8 + Math.random() * 30, w: 2 + Math.random() * 6 });
}

// ---------- 4. COLORES DEL TEMA (día / noche) ----------
function hexARgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
// Mezcla dos colores: t = 0 devuelve a, t = 1 devuelve b
function mezclar(a, b, t) {
  const A = hexARgb(a), B = hexARgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
// Tema actual: se recalcula en cada cuadro según el valor de "noche"
const T = { fondo: "", frente: "", nube: "" };
function actualizarTema() {
  T.fondo = mezclar(COLOR.blanco, COLOR.bordoOscuro, noche);
  T.frente = mezclar(COLOR.bordo, COLOR.blanco, noche);
  T.nube = mezclar("#ecd9dc", "#5a2230", noche);
}

// ---------- 5. CONTROLES ----------
function accion() {
  if (estado === ESTADO.MENU) {
    iniciarPartida();
  } else if (estado === ESTADO.JUGANDO) {
    saltar();
  } else if (estado === ESTADO.GAME_OVER && tiempoGameOver > 0.4) {
    iniciarPartida(); // pequeña espera para no reiniciar sin querer
  }
}

function saltar() {
  if (jugador.enSuelo) {
    jugador.vy = IMPULSO_SALTO;   // impulso hacia arriba
    jugador.enSuelo = false;
    sonido(520, 0.12);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (!e.repeat) accion();
  }
});
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  accion();
});

// ---------- 6. LÓGICA ----------
function iniciarPartida() {
  estado = ESTADO.JUGANDO;
  obstaculos = [];
  memorias = [];
  velocidad = VEL_INICIAL;
  puntaje = 0;
  nuevoRecord = false;
  tiempo = 0;
  noche = 0;
  ultimoHito = 0;
  tiempoParpadeo = 0;
  distanciaHastaSpawn = 500;
  jugador.y = SUELO - jugador.h;
  jugador.vy = 0;
  jugador.enSuelo = true;
}

// Tipos de obstáculos temáticos de Informática
const TIPOS_OBSTACULO = [
  { nombre: "bsod",  w: 44, h: 36 },  // pantalla azul de error
  { nombre: "bucle", w: 70, h: 30 },  // while(true)
  { nombre: "cable", w: 16, h: 52 },  // cable suelto
];

function crearObstaculo() {
  const tipo = TIPOS_OBSTACULO[Math.floor(Math.random() * TIPOS_OBSTACULO.length)];
  const o = { nombre: tipo.nombre, x: W + 20, y: SUELO - tipo.h, w: tipo.w, h: tipo.h };
  obstaculos.push(o);

  // A veces aparece una memoria RAM flotando sobre el obstáculo
  if (Math.random() < 0.45) {
    memorias.push({ x: o.x + o.w / 2 - 14, y: SUELO - 115, w: 28, h: 18 });
  }

  // Separación hasta el próximo obstáculo: crece con la velocidad
  distanciaHastaSpawn = velocidad * (0.85 + Math.random() * 0.75);
}

// Colisión AABB (Axis-Aligned Bounding Box)
function colisiona(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function terminarPartida() {
  estado = ESTADO.GAME_OVER;
  tiempoGameOver = 0;
  sonido(140, 0.35, "sawtooth");
  if (Math.floor(puntaje) > record) {
    record = Math.floor(puntaje);
    nuevoRecord = true;
    localStorage.setItem("bugrunner_record", String(record));
  }
}

function actualizar(dt) {
  desplazamiento += (estado === ESTADO.JUGANDO ? velocidad : 60) * dt;

  // El ciclo día/noche avanza suavemente hacia el valor objetivo
  const objetivo = Math.floor(puntaje / PUNTOS_CAMBIO_DIA_NOCHE) % 2 === 1 ? 1 : 0;
  if (noche < objetivo) noche = Math.min(objetivo, noche + dt * 0.7);
  if (noche > objetivo) noche = Math.max(objetivo, noche - dt * 0.7);

  if (estado === ESTADO.GAME_OVER) {
    tiempoGameOver += dt;
    return;
  }
  if (estado !== ESTADO.JUGANDO) return;

  tiempo += dt;

  // --- Física del jugador ---
  jugador.vy += GRAVEDAD * dt;       // la gravedad cambia la velocidad
  jugador.y += jugador.vy * dt;      // la velocidad cambia la posición
  if (jugador.y + jugador.h >= SUELO) {
    jugador.y = SUELO - jugador.h;
    jugador.vy = 0;
    jugador.enSuelo = true;
  }

  // --- Dificultad progresiva ---
  velocidad = Math.min(VEL_MAXIMA, velocidad + 6 * dt);
  puntaje += velocidad * dt / 12;

  // --- Parpadeo del puntaje cada 100 puntos ---
  const hito = Math.floor(puntaje / 100);
  if (hito > ultimoHito) {
    ultimoHito = hito;
    tiempoParpadeo = 0.9;
    sonido(990, 0.12, "triangle");
  }
  if (tiempoParpadeo > 0) tiempoParpadeo -= dt;

  // --- Aparición de obstáculos ---
  distanciaHastaSpawn -= velocidad * dt;
  if (distanciaHastaSpawn <= 0) crearObstaculo();

  // --- Movimiento y colisiones ---
  // Hitbox del jugador un poco más chica que el dibujo, para que sea justo
  const hitbox = { x: jugador.x + 6, y: jugador.y + 6, w: jugador.w - 12, h: jugador.h - 8 };

  for (const o of obstaculos) {
    o.x -= velocidad * dt;
    const hitObs = { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 3 };
    if (colisiona(hitbox, hitObs)) {
      terminarPartida();
      return;
    }
  }
  obstaculos = obstaculos.filter((o) => o.x + o.w > -10);

  for (const m of memorias) m.x -= velocidad * dt;
  memorias = memorias.filter((m) => {
    if (colisiona(hitbox, m)) {
      puntaje += 10;
      sonido(880, 0.1, "triangle");
      return false;            // se recolecta: desaparece
    }
    return m.x + m.w > -10;
  });
}

// ---------- 7. DIBUJO ----------
function dibujarEscudo(x, y, alto) {
  if (escudoCargado) {
    const ancho = alto * (escudo.width / escudo.height);
    ctx.drawImage(escudo, x, y, ancho, alto);
    return ancho;
  }
  // Escudo de respaldo si no se encuentra assets/escudo.png
  const ancho = alto * 0.84;
  ctx.fillStyle = COLOR.amarillo;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ancho, y);
  ctx.lineTo(x + ancho, y + alto * 0.6);
  ctx.quadraticCurveTo(x + ancho / 2, y + alto * 1.1, x, y + alto * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOR.bordo;
  ctx.font = `bold ${alto * 0.3}px Courier New`;
  ctx.textAlign = "center";
  ctx.fillText("249", x + ancho / 2, y + alto * 0.55);
  return ancho;
}

function dibujarNube(n) {
  ctx.fillStyle = T.nube;
  ctx.fillRect(n.x, n.y + 10, n.w, 8);
  ctx.fillRect(n.x + 8, n.y + 4, n.w - 24, 8);
  ctx.fillRect(n.x + 16, n.y, n.w - 40, 6);
  ctx.fillRect(n.x + 24, n.y + 16, n.w - 36, 4);
}

function dibujarFondo() {
  ctx.fillStyle = T.fondo;
  ctx.fillRect(0, 0, W, H);

  // Sol (de día) y luna (de noche), con transición suave
  const sx = W * 0.5, sy = 70;
  if (noche < 1) {
    ctx.globalAlpha = 1 - noche;
    ctx.fillStyle = COLOR.amarillo;
    ctx.beginPath();
    ctx.arc(sx, sy, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  if (noche > 0) {
    ctx.globalAlpha = noche;
    ctx.fillStyle = COLOR.amarillo;
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.fondo;               // "recorte" que forma la luna creciente
    ctx.beginPath();
    ctx.arc(sx + 10, sy - 4, 18, 0, Math.PI * 2);
    ctx.fill();
    // Estrellas titilantes
    ctx.fillStyle = COLOR.blanco;
    for (const e of estrellas) {
      const brillo = 0.5 + 0.5 * Math.sin(performance.now() / 500 + e.fase);
      ctx.globalAlpha = noche * (0.35 + 0.65 * brillo);
      ctx.fillRect(e.x, e.y, 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  // Nubes con parallax (se mueven más lento que el piso)
  for (const n of nubes) {
    const x = ((n.x - desplazamiento * 0.1) % (W + 120) + (W + 120)) % (W + 120) - 60;
    dibujarNube({ x, y: n.y, w: n.w });
  }

  // Piso estilo dino: una línea y piedritas que se mueven
  ctx.fillStyle = T.frente;
  ctx.fillRect(0, SUELO, W, 2);
  for (const p of piedras) {
    const x = ((p.x - desplazamiento) % (W + 100) + (W + 100)) % (W + 100) - 20;
    ctx.fillRect(x, p.y, p.w, 2);
  }
}

function dibujarJugador() {
  const { x, y, w, h } = jugador;
  // Cuerpo del bug (color de frente: bordó de día, blanco de noche)
  ctx.fillStyle = T.frente;
  ctx.fillRect(x, y + 8, w, h - 16);
  // Franja del caparazón en amarillo
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillRect(x + 4, y + 12, 10, h - 24);
  // Cabeza
  ctx.fillStyle = T.frente;
  ctx.fillRect(x + w - 14, y, 14, 14);
  // Ojo
  ctx.fillStyle = T.fondo;
  ctx.fillRect(x + w - 9, y + 3, 6, 6);
  ctx.fillStyle = T.frente;
  ctx.fillRect(x + w - 6, y + 5, 3, 3);
  // Antena
  ctx.strokeStyle = T.frente;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w - 6, y);
  ctx.lineTo(x + w - 2, y - 8);
  ctx.stroke();
  // Patitas: se alternan al correr
  ctx.fillStyle = T.frente;
  const paso = jugador.enSuelo && estado === ESTADO.JUGANDO ? Math.floor(tiempo * 12) % 2 : 0;
  ctx.fillRect(x + 6, y + h - 8, 6, 8 - paso * 4);
  ctx.fillRect(x + 18, y + h - 8, 6, 4 + paso * 4);
  ctx.fillRect(x + 30, y + h - 8, 6, 8 - paso * 4);
}

function dibujarObstaculo(o) {
  if (o.nombre === "bsod") {
    ctx.fillStyle = "#1769d6";
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = "bold 20px Courier New";
    ctx.textAlign = "center";
    ctx.fillText(":(", o.x + o.w / 2, o.y + 26);
  } else if (o.nombre === "bucle") {
    ctx.fillStyle = COLOR.rojo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = "bold 11px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("while", o.x + o.w / 2, o.y + 13);
    ctx.fillText("(true)", o.x + o.w / 2, o.y + 25);
  } else {
    // cable suelto con chispa
    ctx.fillStyle = T.frente;
    ctx.fillRect(o.x + 5, o.y + 8, 6, o.h - 8);
    ctx.fillStyle = COLOR.amarillo;
    ctx.fillRect(o.x, o.y, o.w, 8);
    ctx.fillStyle = COLOR.rojo;
    ctx.fillRect(o.x + 6, o.y - 5, 4, 5);
  }
}

function dibujarMemoria(m) {
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeStyle = T.frente;
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x, m.y, m.w, m.h);
  ctx.fillStyle = T.frente;
  for (let i = 0; i < 4; i++) ctx.fillRect(m.x + 3 + i * 6, m.y + m.h + 1, 3, 4); // patitas
  ctx.fillStyle = COLOR.bordo;
  ctx.font = "bold 10px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("RAM", m.x + m.w / 2, m.y + 13);
}

function dibujarHUD() {
  dibujarEscudo(10, 8, 40);

  const actual = String(Math.floor(puntaje)).padStart(5, "0");
  const max = String(record).padStart(5, "0");
  ctx.font = "bold 20px Courier New";
  ctx.textAlign = "right";

  // Puntaje actual: parpadea durante un instante al llegar a cada centena
  const visible = tiempoParpadeo <= 0 || Math.floor(tiempoParpadeo * 10) % 2 === 0;
  if (visible) {
    ctx.fillStyle = T.frente;
    ctx.fillText(actual, W - 15, 32);
  }
  // Récord, más tenue (como el "HI" del dino)
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = T.frente;
  ctx.fillText("HI " + max, W - 100, 32);
  ctx.globalAlpha = 1;
}

// Ícono de reiniciar (flecha circular), como en el juego del dino
function dibujarIconoReiniciar(cx, cy) {
  ctx.strokeStyle = T.frente;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0.6, Math.PI * 2 - 0.2);
  ctx.stroke();
  ctx.fillStyle = T.frente;
  ctx.beginPath();
  ctx.moveTo(cx + 8, cy - 22);
  ctx.lineTo(cx + 22, cy - 8);
  ctx.lineTo(cx + 2, cy - 8);
  ctx.closePath();
  ctx.fill();
}

function dibujar() {
  actualizarTema();
  dibujarFondo();

  if (estado === ESTADO.MENU) {
    dibujarJugador();
    dibujarEscudo(W / 2 - 38, 14, 100);
    ctx.textAlign = "center";
    ctx.fillStyle = T.frente;
    ctx.font = "bold 38px Courier New";
    ctx.fillText("BUG RUNNER", W / 2, 145);
    ctx.font = "15px Courier New";
    ctx.fillText("IPET 249 · Especialidad Informática", W / 2, 170);
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = COLOR.rojo;
      ctx.font = "bold 16px Courier New";
      ctx.fillText("Presioná ESPACIO o tocá para jugar", W / 2, 205);
    }
    ctx.fillStyle = T.frente;
    ctx.font = "13px Courier New";
    ctx.fillText("Esquivá los errores y juntá memoria RAM (+10)", W / 2, 232);
    return;
  }

  memorias.forEach(dibujarMemoria);
  obstaculos.forEach(dibujarObstaculo);
  dibujarJugador();
  dibujarHUD();

  if (estado === ESTADO.GAME_OVER) {
    ctx.textAlign = "center";
    ctx.fillStyle = T.frente;
    ctx.font = "bold 30px Courier New";
    ctx.fillText("G A M E   O V E R", W / 2, 95);
    dibujarIconoReiniciar(W / 2, 145);
    ctx.font = "16px Courier New";
    ctx.fillText(`Puntaje: ${Math.floor(puntaje)}   Récord máximo: ${record}`, W / 2, 192);
    if (nuevoRecord) {
      ctx.fillStyle = COLOR.rojo;
      ctx.font = "bold 16px Courier New";
      ctx.fillText("¡NUEVO RÉCORD!", W / 2, 215);
    }
  }
}

// ---------- 8. GAME LOOP ----------
let ultimoTiempo = 0;
function bucle(ahora) {
  // dt = segundos transcurridos desde el cuadro anterior.
  // Se limita para que, si la pestaña se pausa, el juego no "salte".
  const dt = Math.min((ahora - ultimoTiempo) / 1000, 0.05) || 0;
  ultimoTiempo = ahora;

  actualizar(dt);
  dibujar();
  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);
