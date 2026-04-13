/* ════════════════════════════════════════════════════
   Proyecto Final Circuitos DC 2026-1
   Daniel Polanco & Juan Perdomo – USCO
   script.js
   ════════════════════════════════════════════════════

   Flujo:
     1. fetchFirebase() consulta Firebase RTDB cada 1.5 s
     2. Se actualiza la gráfica con Chart.js (historial local)
     3. Se actualizan las tarjetas (actual, máx, mín, promedio)
   ════════════════════════════════════════════════════ */

/* ── Configuración ────────────────────────────────── */
const FIREBASE_URL   = 'https://project-dc-pt100-default-rtdb.firebaseio.com/sensor.json';
const POLL_MS        = 1500;   /* Intervalo de consulta en ms    */
const MAX_PUNTOS     = 60;     /* Puntos visibles en la gráfica  */

/* ── Estado ───────────────────────────────────────── */
const histTemp  = [];          /* Historial de temperaturas      */
const histTime  = [];          /* Historial de marcas de tiempo  */

let statMax     = null;
let statMaxTime = '--:--:--';
let statMin     = null;
let statMinTime = '--:--:--';
let statSum     = 0;
let statCount   = 0;

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
      pointRadius:     0,             /* Sin puntos: línea más limpia */
      pointHoverRadius:5,
      fill:            true,
      tension:         0.35,          /* Curva suavizada              */
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
        display:  true,
        text:     'PT100 – Temperatura en Tiempo Real',
        color:    '#1a1a2e',
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
          /* Mostrar solo cada N etiquetas según puntos acumulados */
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

/* Devuelve HH:MM:SS */
function horaActual() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

/* Dispara animación flash en una tarjeta */
function flashCard(el) {
  el.classList.remove('flash');
  void el.offsetWidth;          /* reflow para reiniciar animación */
  el.classList.add('flash');
}

/* Actualiza el pill de estado */
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

  /* ── Actual ── */
  elActual.textContent = temp.toFixed(1);
  flashCard(elActual.closest('.card'));

  /* ── Máxima ── */
  if (statMax === null || temp > statMax) {
    statMax     = temp;
    statMaxTime = hora;
    flashCard(elMax.closest('.card'));
  }
  elMax.textContent     = statMax.toFixed(1);
  elMaxTime.textContent = statMaxTime;

  /* ── Mínima ── */
  if (statMin === null || temp < statMin) {
    statMin     = temp;
    statMinTime = hora;
    flashCard(elMin.closest('.card'));
  }
  elMin.textContent     = statMin.toFixed(1);
  elMinTime.textContent = statMinTime;

  /* ── Promedio ── */
  statSum   += temp;
  statCount += 1;
  elAvg.textContent = (statSum / statCount).toFixed(1);

  /* ── Contador ── */
  elCount.textContent = statCount;
}

/* ════════════════════════════════════════════════════
   ACTUALIZAR GRÁFICA
   ════════════════════════════════════════════════════ */
function actualizarGrafica(temp) {
  const hora = horaActual();

  histTemp.push(temp);
  histTime.push(hora);

  /* Mantener solo MAX_PUNTOS valores */
  if (histTemp.length > MAX_PUNTOS) {
    histTemp.shift();
    histTime.shift();
  }

  chart.update();
}

/* ════════════════════════════════════════════════════
   POLLING FIREBASE
   ════════════════════════════════════════════════════ */
let errorConsecutivos = 0;

async function fetchFirebase() {
  try {
    const resp = await fetch(FIREBASE_URL, { cache: 'no-store' });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const temp = parseFloat(data?.temperatura);

    if (isNaN(temp)) throw new Error('Valor NaN recibido');

    /* Éxito ✓ */
    errorConsecutivos = 0;
    setEstado('live');

    actualizarUI(temp);
    actualizarGrafica(temp);

  } catch (err) {
    errorConsecutivos++;
    console.warn('[Firebase] Error de lectura:', err.message);

    /* Reportar estado de error si falla 3 veces seguidas */
    if (errorConsecutivos >= 3) setEstado('error');
  }
}

/* ════════════════════════════════════════════════════
   ARRANQUE
   ════════════════════════════════════════════════════ */
setEstado('');            /* Pill en "Conectando…" */
fetchFirebase();          /* Primera lectura inmediata */
setInterval(fetchFirebase, POLL_MS);
