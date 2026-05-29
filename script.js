/* ════════════════════════════════════════════════════
   Proyecto Final Circuitos DC 2026-1
   Daniel Polanco & Juan Perdomo – USCO
   script.js
   ════════════════════════════════════════════════════
 
   Flujo:
     1. fetchFirebase() consulta Firebase RTDB cada ! s
     2. Se compara el timestamp "ts" recibido con el anterior
        → Si el ts no cambia en TIMEOUT_MS ms = ESP32 desconectada
     3. Se actualiza la gráfica con Chart.js (historial local)
     4. Se actualizan las tarjetas (actual, máx, mín, promedio)
   ════════════════════════════════════════════════════ */
 
/* ── Configuración ────────────────────────────────── */
const FIREBASE_URL = 'https://project-dc-pt100-default-rtdb.firebaseio.com/sensor.json';
const POLL_MS      = 1000;   /* Intervalo de consulta en ms         */
const MAX_PUNTOS   = 60;     /* Puntos visibles en la gráfica       */
const TIMEOUT_MS   = 8000;   /* Si el ts no cambia en 8 s → offline */
 
/* ── Estado ───────────────────────────────────────── */
const histTemp  = [];
const histTime  = [];
 
let statMax     = null;
let statMaxTime = '--:--:--';
let statMin     = null;
let statMinTime = '--:--:--';
let statSum     = 0;
let statCount   = 0;
 
let lastTs          = null;   /* Último timestamp recibido de Firebase */
let lastTsChangedAt = null;   /* Momento (Date.now()) en que cambió ts */
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
          text:    'Tiempo',
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
function horaActual() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}
 
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
   ════════════════════════════════════════════════════ */
function actualizarUI(temp) {
  const hora = horaActual();
 
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
   ════════════════════════════════════════════════════ */
function actualizarGrafica(temp) {
  histTemp.push(temp);
  histTime.push(horaActual());
 
  if (histTemp.length > MAX_PUNTOS) {
    histTemp.shift();
    histTime.shift();
  }
 
  chart.update();
}
 
/* ════════════════════════════════════════════════════
   POLLING FIREBASE
   ════════════════════════════════════════════════════
   Firebase guarda: { "temperatura": 25.3, "ts": 1748123456 }
   "ts" es un entero que cambia con cada envío de la ESP32.
   Si "ts" deja de cambiar más de TIMEOUT_MS → ESP32 offline.
   ════════════════════════════════════════════════════ */
async function fetchFirebase() {
  try {
    const resp = await fetch(FIREBASE_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
 
    const data = await resp.json();
    const temp = parseFloat(data?.temperatura);
    const ts   = data?.timestamp_ms;                      /* Timestamp enviado por la ESP32 */
 
    if (isNaN(temp)) throw new Error('Valor NaN recibido');
 
    /* ── Detección de desconexión por timestamp ── */
    if (ts !== undefined && ts !== null) {
      if (ts !== lastTs) {
        /* El timestamp cambió → ESP32 activa */
        lastTs          = ts;
        lastTsChangedAt = Date.now();
        errorConsecutivos = 0;
        setEstado('live');
        actualizarUI(temp);
        actualizarGrafica(temp);
      } else {
        /* El timestamp NO cambió → verificar tiempo transcurrido */
        const elapsed = Date.now() - lastTsChangedAt;
        if (elapsed >= TIMEOUT_MS) {
          setEstado('error');   /* ESP32 desconectada */
        }
        /* Si aún no supera el timeout, mantener estado actual */
      }
    } else {
      /* Firebase no tiene campo "ts" → comportamiento anterior como fallback */
      errorConsecutivos = 0;
      setEstado('live');
      actualizarUI(temp);
      actualizarGrafica(temp);
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
setEstado('');
fetchFirebase();
setInterval(fetchFirebase, POLL_MS);
 
