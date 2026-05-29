/* ════════════════════════════════════════════════════
   Proyecto Final Circuitos DC 2026-1
   Daniel Polanco & Juan Perdomo – USCO
   script.js
   ════════════════════════════════════════════════════ */

/* ── Configuración ────────────────────────────────── */
const FIREBASE_URL  = 'https://project-dc-pt100-default-rtdb.firebaseio.com/sensor.json';
const POLL_MS       = 1000;
const MAX_PUNTOS    = 30;
const TIMEOUT_S     = 25;    /* segundos máx de antigüedad del dato */
const TEMP_ALERTA   = 65.0;

/* ── Estado ───────────────────────────────────────── */
const histTemp  = [];
const histTime  = [];

let statMax     = null;
let statMaxTime = '--:--:--';
let statMin     = null;
let statMinTime = '--:--:--';
let statSum     = 0;
let statCount   = 0;

let errorConsecutivos = 0;
let alertaActiva      = false;
let audioCtx          = null;
let alarmaInterval    = null;

/* ── Elementos del DOM ────────────────────────────── */
const elActual    = document.getElementById('cActual');
const elMax       = document.getElementById('cMax');
const elMaxTime   = document.getElementById('cMaxTime');
const elMin       = document.getElementById('cMin');
const elMinTime   = document.getElementById('cMinTime');
const elAvg       = document.getElementById('cAvg');
const elCount     = document.getElementById('readingsCount');
const elStatusPill= document.getElementById('statusPill');
const elStatusTxt = document.getElementById('statusText');

/* ════════════════════════════════════════════════════
   UTILIDAD: comparar hora del dato con hora actual
   Ambos en Colombia (UTC-5). Devuelve diferencia en segundos.
   Maneja cruce de medianoche.
   ════════════════════════════════════════════════════ */
function edadEnSegundos(horaStr) {
  if (!horaStr || horaStr === '--:--:--') return Infinity;
  const [hh, mm, ss] = horaStr.split(':').map(Number);
  const ahora  = new Date();

  /* Hora del dato en el mismo día del navegador */
  const dato   = new Date();
  dato.setHours(hh, mm, ss, 0);

  let diff = (ahora - dato) / 1000;

  /* Ajuste cruce de medianoche */
  if (diff < -60)    diff += 86400;
  if (diff > 86340)  diff -= 86400;

  return diff;
}

/* ════════════════════════════════════════════════════
   INYECTAR ESTILOS DE ALERTA
   ════════════════════════════════════════════════════ */
const estilosAlerta = document.createElement('style');
estilosAlerta.textContent = `
  #alertaOverlay {
    display: none;
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9998;
    animation: bordeLatido 0.5s ease-in-out infinite alternate;
  }
  #alertaOverlay.activo { display: block; }
  @keyframes bordeLatido {
    0%   { box-shadow: inset 0 0 30px 8px rgba(220,20,20,.6), inset 0 0 80px 20px rgba(220,20,20,.2), 0 0 40px 10px rgba(220,20,20,.4); }
    100% { box-shadow: inset 0 0 70px 25px rgba(255,0,0,1),   inset 0 0 140px 60px rgba(200,0,0,.5), 0 0 100px 40px rgba(255,0,0,.8); }
  }
  #alertaFlash {
    display: none;
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9997;
    animation: flashPantalla 0.5s ease-in-out infinite alternate;
  }
  #alertaFlash.activo { display: block; }
  @keyframes flashPantalla {
    0%   { background: rgba(180,0,0,0); }
    100% { background: rgba(180,0,0,.08); }
  }
  #alertaBanner {
    display: none;
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%,-50%) scale(.8);
    z-index: 9999;
    background: linear-gradient(135deg,#7f0000 0%,#c62828 40%,#7f0000 100%);
    border: 3px solid rgba(255,100,100,.6);
    border-radius: 16px;
    padding: 32px 48px;
    text-align: center;
    color: #fff;
    box-shadow: 0 0 0 4px rgba(255,0,0,.3), 0 0 60px rgba(255,0,0,.6), 0 20px 60px rgba(0,0,0,.5);
    opacity: 0;
    transition: opacity .3s ease, transform .3s ease;
    min-width: 340px;
  }
  #alertaBanner.activo {
    display: block; opacity: 1;
    transform: translate(-50%,-50%) scale(1);
    animation: bannerPulso .8s ease-in-out infinite alternate;
  }
  @keyframes bannerPulso {
    0%   { box-shadow: 0 0 0 4px rgba(255,0,0,.3), 0 0 40px rgba(255,0,0,.5), 0 20px 60px rgba(0,0,0,.5); }
    100% { box-shadow: 0 0 0 8px rgba(255,0,0,.6), 0 0 90px rgba(255,0,0,.9), 0 20px 80px rgba(0,0,0,.7); }
  }
  .alerta-icono-wrap {
    font-size: 3.5rem;
    animation: iconoLatido .4s ease-in-out infinite alternate;
    display: block; margin-bottom: 8px;
  }
  @keyframes iconoLatido {
    0%   { transform: scale(1)   rotate(-8deg); filter: drop-shadow(0 0 6px rgba(255,200,0,.6)); }
    100% { transform: scale(1.2) rotate(8deg);  filter: drop-shadow(0 0 20px rgba(255,100,0,1)); }
  }
  .alerta-titulo {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 2.6rem; font-weight: 800; letter-spacing: 4px;
    text-transform: uppercase;
    text-shadow: 0 0 20px rgba(255,100,100,1), 0 2px 4px rgba(0,0,0,.5);
    animation: textoParpadeo .5s ease-in-out infinite alternate;
    display: block; margin-bottom: 10px;
  }
  @keyframes textoParpadeo {
    0%   { opacity: 1;    text-shadow: 0 0 10px rgba(255,100,100,.8); }
    100% { opacity: .85;  text-shadow: 0 0 40px rgba(255,50,50,1), 0 0 80px rgba(255,0,0,.6); }
  }
  #alertaTemp {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 3.8rem; font-weight: 800; color: #ffeb3b;
    text-shadow: 0 0 20px rgba(255,235,59,.9), 0 2px 4px rgba(0,0,0,.5);
    display: block; line-height: 1; margin-bottom: 8px;
    animation: tempBrillo .6s ease-in-out infinite alternate;
  }
  @keyframes tempBrillo {
    0%   { text-shadow: 0 0 10px rgba(255,235,59,.5); }
    100% { text-shadow: 0 0 40px rgba(255,235,59,1), 0 0 70px rgba(255,200,0,.8); }
  }
  .alerta-sub { font-size: 1rem; font-weight: 600; opacity: .9; letter-spacing: 1px; display: block; margin-top: 6px; }
  .alerta-linea {
    width: 60px; height: 3px;
    background: rgba(255,235,59,.7);
    margin: 14px auto; border-radius: 2px;
    animation: lineaExpand .6s ease-in-out infinite alternate;
  }
  @keyframes lineaExpand {
    0%   { width: 40px;  opacity: .5; }
    100% { width: 120px; opacity: 1; }
  }
  .alerta-esquina { display: none; position: fixed; width: 80px; height: 80px; z-index: 9999; pointer-events: none; }
  .alerta-esquina.activo { display: block; }
  .alerta-esquina::before, .alerta-esquina::after {
    content: ''; position: absolute; background: #ff1744;
    animation: esquinaFlash .5s ease-in-out infinite alternate;
  }
  .alerta-esquina::before { width: 100%; height: 6px; top: 0; left: 0; }
  .alerta-esquina::after  { width: 6px; height: 100%; top: 0; left: 0; }
  .eq-tl { top: 0;    left: 0; }
  .eq-tr { top: 0;    right: 0;  transform: scaleX(-1); }
  .eq-bl { bottom: 0; left: 0;  transform: scaleY(-1); }
  .eq-br { bottom: 0; right: 0; transform: scale(-1); }
  @keyframes esquinaFlash {
    0%   { opacity: .3; box-shadow: 0 0 5px  rgba(255,23,68,.5); }
    100% { opacity: 1;  box-shadow: 0 0 25px rgba(255,23,68,1); }
  }
  @media (max-width: 600px) {
    #alertaBanner { padding: 24px 28px; min-width: 280px; }
    .alerta-titulo { font-size: 2rem; }
    #alertaTemp    { font-size: 3rem; }
  }
`;
document.head.appendChild(estilosAlerta);

/* ── Crear elementos de alerta ────────────────────── */
const alertaOverlay = document.createElement('div');
alertaOverlay.id = 'alertaOverlay';
document.body.appendChild(alertaOverlay);

const alertaFlash = document.createElement('div');
alertaFlash.id = 'alertaFlash';
document.body.appendChild(alertaFlash);

['eq-tl','eq-tr','eq-bl','eq-br'].forEach(cls => {
  const el = document.createElement('div');
  el.className = `alerta-esquina ${cls}`;
  document.body.appendChild(el);
});

const alertaBanner = document.createElement('div');
alertaBanner.id = 'alertaBanner';
alertaBanner.innerHTML = `
  <span class="alerta-icono-wrap">⚠️</span>
  <span class="alerta-titulo">¡ A L E R T A !</span>
  <div class="alerta-linea"></div>
  <span id="alertaTemp">-- °C</span>
  <span class="alerta-sub">🌡️ Temperatura alarmante — el sistema necesita refrigerarse</span>`;
document.body.appendChild(alertaBanner);

/* ════════════════════════════════════════════════════
   SONIDO DE ALARMA
   ════════════════════════════════════════════════════ */
function iniciarAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function beepAlarma() {
  if (!audioCtx) return;
  const patron = [
    {f:1200,d:.12},{f:800,d:.08},
    {f:1200,d:.12},{f:800,d:.08},
    {f:1500,d:.20}
  ];
  let t = audioCtx.currentTime;
  patron.forEach(({f,d}) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + d);
    osc.start(t); osc.stop(t + d + .01);
    t += d + .05;
  });
}

function activarAlarma()  { if (alarmaInterval) return; iniciarAudio(); beepAlarma(); alarmaInterval = setInterval(beepAlarma, 1800); }
function detenerAlarma()  { if (alarmaInterval) { clearInterval(alarmaInterval); alarmaInterval = null; } }

/* ════════════════════════════════════════════════════
   GESTIONAR ALERTA VISUAL + SONORA
   ════════════════════════════════════════════════════ */
function verificarAlerta(temp) {
  if (temp >= TEMP_ALERTA) {
    document.getElementById('alertaTemp').textContent = temp.toFixed(1) + ' °C';
    if (!alertaActiva) {
      alertaActiva = true;
      alertaOverlay.classList.add('activo');
      alertaFlash.classList.add('activo');
      alertaBanner.classList.add('activo');
      document.querySelectorAll('.alerta-esquina').forEach(e => e.classList.add('activo'));
      activarAlarma();
    }
  } else {
    if (alertaActiva) {
      alertaActiva = false;
      alertaOverlay.classList.remove('activo');
      alertaFlash.classList.remove('activo');
      alertaBanner.classList.remove('activo');
      document.querySelectorAll('.alerta-esquina').forEach(e => e.classList.remove('activo'));
      detenerAlarma();
    }
  }
}

/* ════════════════════════════════════════════════════
   INICIALIZAR CHART.JS
   ════════════════════════════════════════════════════ */
const ctx   = document.getElementById('tempChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels:   histTime,
    datasets: [{
      label:            'PT100 (°C)',
      data:             histTemp,
      borderColor:      '#1565c0',
      backgroundColor:  'rgba(21,101,192,.10)',
      borderWidth:      2.5,
      pointRadius:      0,
      pointHoverRadius: 5,
      fill:             true,
      tension:          0.35,
    }]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    animation:   { duration: 400, easing: 'easeOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      title: {
        display: true, text: 'PT100 – Temperatura en Tiempo Real',
        color: '#1a1a2e',
        font: { family: "'Barlow Condensed', sans-serif", size: 16, weight: '700' },
        padding: { bottom: 10 }
      },
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(26,26,46,.9)', titleColor: '#90caf9',
        bodyColor: '#ffffff', borderColor: 'rgba(255,255,255,.1)',
        borderWidth: 1, padding: 10,
        callbacks: { label: c => ` ${c.parsed.y.toFixed(2)} °C` }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#888', font: { size: 10, family: "'DM Sans', sans-serif" },
          maxRotation: 0,
          callback: function(val, idx) {
            const step = Math.max(1, Math.floor(this.chart.data.labels.length / 6));
            return idx % step === 0 ? this.getLabelForValue(val) : '';
          }
        },
        grid:  { color: 'rgba(0,0,0,.06)' },
        title: { display: true, text: 'Hora', color: '#888', font: { size: 11, family: "'DM Sans', sans-serif" } }
      },
      y: {
        ticks: { color: '#888', font: { size: 10, family: "'DM Sans', sans-serif" }, callback: v => v.toFixed(1) + ' °C' },
        grid:  { color: 'rgba(0,0,0,.06)' },
        title: { display: true, text: 'Temperatura (°C)', color: '#888', font: { size: 11, family: "'DM Sans', sans-serif" } }
      }
    }
  }
});

/* ════════════════════════════════════════════════════
   UTILIDADES
   ════════════════════════════════════════════════════ */
function flashCard(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

function setEstado(estado) {
  elStatusPill.className = 'status-pill ' + estado;
  if (estado === 'live')  elStatusTxt.textContent = 'En vivo';
  if (estado === 'error') elStatusTxt.textContent = 'Sin señal';
  if (estado === '')      elStatusTxt.textContent = 'Conectando…';
}

/* ════════════════════════════════════════════════════
   ACTUALIZAR TARJETAS
   ════════════════════════════════════════════════════ */
function actualizarUI(temp, hora) {
  elActual.textContent = temp.toFixed(1);
  flashCard(elActual.closest('.card'));

  if (statMax === null || temp > statMax) { statMax = temp; statMaxTime = hora; flashCard(elMax.closest('.card')); }
  elMax.textContent     = statMax.toFixed(1);
  elMaxTime.textContent = statMaxTime;

  if (statMin === null || temp < statMin) { statMin = temp; statMinTime = hora; flashCard(elMin.closest('.card')); }
  elMin.textContent     = statMin.toFixed(1);
  elMinTime.textContent = statMinTime;

  statSum += temp; statCount += 1;
  elAvg.textContent   = (statSum / statCount).toFixed(1);
  elCount.textContent = statCount;

  verificarAlerta(temp);
}

/* ════════════════════════════════════════════════════
   ACTUALIZAR GRÁFICA
   ════════════════════════════════════════════════════ */
function actualizarGrafica(temp, hora) {
  histTemp.push(temp); histTime.push(hora);
  if (histTemp.length > MAX_PUNTOS) { histTemp.shift(); histTime.shift(); }
  chart.update();
}

/* ════════════════════════════════════════════════════
   POLLING FIREBASE
   ════════════════════════════════════════════════════
   Lógica de conexión (Opción A — hora NTP de la ESP32):
     1. Lee campo "hora" enviado por la ESP32 via NTP Colombia
     2. Compara con la hora actual del navegador (también Colombia)
     3. Si la diferencia es <= TIMEOUT_S → En vivo
     4. Si la diferencia es  > TIMEOUT_S → Sin señal
   Esto evita que un dato viejo en Firebase marque "En vivo".
   ════════════════════════════════════════════════════ */
async function fetchFirebase() {
  try {
    const resp = await fetch(FIREBASE_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const temp = parseFloat(data?.temperatura);
    const hora = data?.hora || '--:--:--';

    if (isNaN(temp)) throw new Error('Valor NaN');

    const edad = edadEnSegundos(hora);

    if (edad >= 0 && edad <= TIMEOUT_S) {
      /* Dato reciente → ESP32 activa */
      errorConsecutivos = 0;
      setEstado('live');
      actualizarUI(temp, hora);
      actualizarGrafica(temp, hora);
    } else {
      /* Dato antiguo → ESP32 desconectada, no actualizar UI */
      setEstado('error');
    }

  } catch (err) {
    errorConsecutivos++;
    console.warn('[Firebase] Error:', err.message);
    if (errorConsecutivos >= 3) setEstado('error');
  }
}

/* ════════════════════════════════════════════════════
   ARRANQUE — inicia siempre como desconectado
   ════════════════════════════════════════════════════ */
setEstado('error');
fetchFirebase();
setInterval(fetchFirebase, POLL_MS);
document.addEventListener('click', iniciarAudio, { once: true });
