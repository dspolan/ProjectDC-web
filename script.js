/* ════════════════════════════════════════════════════
   Proyecto Final Circuitos DC 2026-1
   Daniel Polanco & Juan Perdomo – USCO
   script.js
   ════════════════════════════════════════════════════
 
   Flujo:
     1. fetchFirebase() consulta Firebase RTDB cada 1 s
     2. Compara timestamp_ms para detectar si la ESP32
        sigue activa o se desconectó
     3. Muestra fecha y hora exacta de cada medición
        en la gráfica y las tarjetas
   ════════════════════════════════════════════════════ */
 
/* ── Configuración ────────────────────────────────── */
const FIREBASE_URL = 'https://project-dc-pt100-default-rtdb.firebaseio.com/sensor.json';
const POLL_MS      = 1000;   /* Consulta cada 1 segundo            */
const MAX_PUNTOS   = 60;     /* Puntos visibles en la gráfica      */
const TIMEOUT_MS   = 8000;   /* Sin cambio en 8 s → ESP32 offline  */
 
/* ── Estado ───────────────────────────────────────── */
const histTemp  = [];
const histTime  = [];
 
let statMax     = null;
let statMaxTime = '--:--:--';
let statMin     = null;
let statMinTime = '--:--:--';
let statSum     = 0;
let statCount   = 0;
 
let lastTs          = null;
let lastTsChangedAt = null;
let errorConsecutivos = 0;
 
/* ── Elementos del DOM ────────────────────────────── */
const elActual    = document.getElementById('cActual');
const elMax       = document.getElementById('cMax');
const elMaxTime   = document.getElementById('cMaxTime');
const elMin       = document.getElementById('cMin');
const elMinTime   = document.getElementById('cMinTime');
const elAvg       = document.getElementById('cAvg');
const elCount     = document.getElementById('readingsCount');
const elStatusDot = document.getElementById('statusDot');
const elStatusTxt = document.getElementById('statusText');
const elStatusPill= document.getElementById('statusPill');
 
/* ════════════════════════════════════════════════════
   INICIALIZAR CHART.JS
   ════════════════════════════════════════════════════ */
const ctx   = document.getElementById('tempChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels:   histTime,
    datasets: [{
      label:           'PT100 (°C)',
      data:            histTemp,
      borderColor:     '#1565c0',
      backgroundColor: 'rgba(21,101,192,.10)',
      borderWidth:     2.5,
      pointRadius:     0,
      pointHoverRadius: 5,
      fill:            true,
      tension:         0.35,
    }]
  },
  options: {
    responsive:          true,
    maintainAspectRatio: false,
    animation: {
      duration: 400,
      easing:   'easeOutQuart'
    },
    interaction: {
      mode:      'index',
      intersect: false,
    },
    plugins: {
      title: {
        display: true,
        text:    'PT100 – Temperatura en Tiempo Real',
        color:   '#1a1a2e',
        font: {
          family: "'Barlow Condensed', sans-serif",
          size:   16,
          weight: '700',
        },
        padding: { bottom: 10 }
      },
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(26,26,46,.9)',
        titleColor:      '#90caf9',
        bodyColor:       '#ffffff',
        borderColor:     'rgba(255,255,255,.1)',
        borderWidth:     1,
        padding:         10,
        callbacks: {
          label: ctx => ` ${ctx.parsed.y.toFixed(2)} °C`
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color:    '#888',
          font:     { size: 10, family: "'DM Sans', sans-serif" },
          maxRotation: 0,
          callback: function(val, idx) {
            const step = Math.max(1, Math.floor(this.chart.data.labels.length / 6));
            return idx % step === 0 ? this.getLabelForValue(val) : '';
          }
        },
        grid: { color: 'rgba(0,0,0,.06)' },
        title: {
          display: true,
          text:    'Hora',
          color:   '#888',
          font:    { size: 11, family: "'DM Sans', sans-serif" }
        }
      },
      y: {
        ticks: {
          color:    '#888',
          font:     { size: 10, family: "'DM Sans', sans-serif" },
          callback: v => v.toFixed(1) + ' °C'
        },
        grid: { color: 'rgba(0,0,0,.06)' },
        title: {
          display: true,
          text:    'Temperatura (°C)',
          color:   '#888',
          font:    { size: 11, family: "'DM Sans', sans-serif" }
        }
      }
    }
  }
});
 
/* ════════════════════════════════════════════════════
   UTILIDADES
   ════════════════════════════════════════════════════ */
function flashCard(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
 
function setEstado(estado) {
  elStatusPill.className = 'status-pill ' + estado;
  if (estado === 'live')  elStatusTxt.textContent = 'En vivo';
  if (estado === 'error') elStatusTxt.textContent = 'Sin señal';
  if (estado === '')      elStatusTxt.textContent = 'Conectando…';
}
 
/* ════════════════════════════════════════════════════
   ACTUALIZAR TARJETAS
   Usa la hora real enviada por la ESP32
   ════════════════════════════════════════════════════ */
function actualizarUI(temp, hora) {
  elActual.textContent = temp.toFixed(1);
  flashCard(elActual.closest('.card'));
 
  if (statMax === null || temp > statMax) {
    statMax     = temp;
    statMaxTime = hora;
    flashCard(elMax.closest('.card'));
  }
  elMax.textContent     = statMax.toFixed(1);
  elMaxTime.textContent = statMaxTime;
 
  if (statMin === null || temp < statMin) {
    statMin     = temp;
    statMinTime = hora;
    flashCard(elMin.closest('.card'));
  }
  elMin.textContent     = statMin.toFixed(1);
  elMinTime.textContent = statMinTime;
 
  statSum   += temp;
  statCount += 1;
  elAvg.textContent   = (statSum / statCount).toFixed(1);
  elCount.textContent = statCount;
}
 
/* ════════════════════════════════════════════════════
   ACTUALIZAR GRÁFICA
   Usa la hora real enviada por la ESP32
   ════════════════════════════════════════════════════ */
function actualizarGrafica(temp, hora) {
  histTemp.push(temp);
  histTime.push(hora);
 
  if (histTemp.length > MAX_PUNTOS) {
    histTemp.shift();
    histTime.shift();
  }
 
  chart.update();
}
 
/* ════════════════════════════════════════════════════
   POLLING FIREBASE
   Firebase guarda:
   {
     "temperatura" : 25.3,
     "fecha"       : "2026-05-28",
     "hora"        : "14:35:22",
     "timestamp_ms": 1748123456000
   }
   ════════════════════════════════════════════════════ */
async function fetchFirebase() {
  try {
    const resp = await fetch(FIREBASE_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 
    const data = await resp.json();
    const temp = parseFloat(data?.temperatura);
    const hora = data?.hora  || '--:--:--';
    const ts   = data?.timestamp_ms;
 
    if (isNaN(temp)) throw new Error('Valor NaN recibido');
 
    /* ── Detección de desconexión por timestamp ── */
    if (ts !== undefined && ts !== null) {
      if (ts !== lastTs) {
        /* Timestamp cambió → ESP32 activa */
        lastTs          = ts;
        lastTsChangedAt = Date.now();
        errorConsecutivos = 0;
        setEstado('live');
        actualizarUI(temp, hora);
        actualizarGrafica(temp, hora);
      } else {
        /* Timestamp igual → verificar tiempo transcurrido */
        const elapsed = Date.now() - lastTsChangedAt;
        if (elapsed >= TIMEOUT_MS) {
          setEstado('error');  /* ESP32 desconectada */
        }
      }
    } else {
      /* Sin campo timestamp → fallback sin detección */
      errorConsecutivos = 0;
      setEstado('live');
      actualizarUI(temp, hora);
      actualizarGrafica(temp, hora);
    }
 
  } catch (err) {
    errorConsecutivos++;
    console.warn('[Firebase] Error de lectura:', err.message);
    if (errorConsecutivos >= 3) setEstado('error');
  }
}
 
/* ════════════════════════════════════════════════════
   ARRANQUE
   ════════════════════════════════════════════════════ */
setEstado('error');  /* Inicia como desconectado */
fetchFirebase();
setInterval(fetchFirebase, POLL_MS);
 
