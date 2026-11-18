const ZONA_HORARIA = "America/Bogota";
const formatoHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA_HORARIA,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const formatoCompleto = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA_HORARIA,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const formatoValor = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const selectorHoras = document.getElementById("horas");
const salidaHoras = document.getElementById("horas-valor");
const estado = document.getElementById("estado");
const boton = document.getElementById("actualizar");
let grafica;

selectorHoras.addEventListener("input", () => {
  salidaHoras.value = `${selectorHoras.value} h`;
  salidaHoras.textContent = `${selectorHoras.value} h`;
});

document.getElementById("controles").addEventListener("submit", (evento) => {
  evento.preventDefault();
  cargarPronostico();
});

function mostrarEstado(mensaje, tipo = "") {
  estado.textContent = mensaje;
  estado.className = `status ${tipo}`.trim();
}

function formatearTiempo(iso, completo = false) {
  return (completo ? formatoCompleto : formatoHora).format(new Date(iso));
}

function crearGrafica(historico, prediccion) {
  if (grafica) grafica.destroy();

  const etiquetas = [
    ...historico.map((punto) => formatearTiempo(punto.tiempo)),
    ...prediccion.map((punto) => formatearTiempo(punto.tiempo)),
  ];
  const ultimoHistorico = historico.length - 1;
  const relleno = new Array(historico.length).fill(null);

  grafica = new Chart(document.getElementById("grafica"), {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: "Histórico",
          data: [...historico.map((punto) => punto.valor), ...prediccion.map(() => null)],
          borderColor: "#4775d1",
          backgroundColor: "#4775d1",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.28,
        },
        {
          label: "Límite inferior",
          data: [...relleno, ...prediccion.map((punto) => punto.limite_inferior)],
          borderWidth: 0,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "Intervalo de confianza",
          data: [...relleno, ...prediccion.map((punto) => punto.limite_superior)],
          borderWidth: 0,
          pointRadius: 0,
          backgroundColor: "rgba(71, 117, 209, 0.14)",
          fill: "-1",
        },
        {
          label: "Pronóstico",
          data: [
            ...historico.slice(0, -1).map(() => null),
            ...(historico.length ? [historico[ultimoHistorico].valor] : []),
            ...prediccion.map((punto) => punto.prediccion),
          ],
          borderColor: "#42a8a6",
          backgroundColor: "#42a8a6",
          borderWidth: 2.5,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.28,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "start",
          labels: {
            color: "#718198",
            boxWidth: 18,
            boxHeight: 2,
            usePointStyle: true,
            pointStyle: "line",
            filter: (item) => item.text !== "Límite inferior",
          },
        },
        tooltip: {
          backgroundColor: "#17283e",
          padding: 11,
          titleFont: { weight: "600" },
          callbacks: {
            title: (items) => items.length
              ? formatearTiempo(
                (items[0].dataIndex < historico.length
                  ? historico[items[0].dataIndex]
                  : prediccion[items[0].dataIndex - historico.length]).tiempo,
                true,
              )
              : "",
            label: (contexto) => contexto.raw === null || contexto.dataset.label === "Límite inferior"
              ? null
              : ` ${contexto.dataset.label}: ${formatoValor.format(contexto.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#8a98aa", maxTicksLimit: 9, maxRotation: 0, autoSkip: true },
          border: { display: false },
        },
        y: {
          grid: { color: "#edf1f6", drawTicks: false },
          ticks: {
            color: "#8a98aa",
            padding: 10,
            callback: (valor) => formatoValor.format(valor),
          },
          border: { display: false, dash: [3, 5] },
        },
      },
    },
  });
}

async function cargarPronostico() {
  boton.disabled = true;
  boton.textContent = "Cargando…";
  mostrarEstado("Consultando el pronóstico…");
  try {
    const parametros = new URLSearchParams({ horas: selectorHoras.value, historia: "48", confianza: "0.95" });
    const respuesta = await fetch(`/api/prediccion?${parametros}`);
    let datos;
    try {
      datos = await respuesta.json();
    } catch {
      throw new Error(`La API respondió con un formato no válido (HTTP ${respuesta.status}).`);
    }
    if (!respuesta.ok) {
      const detalle = typeof datos.detail === "string" ? datos.detail : JSON.stringify(datos.detail);
      throw new Error(detalle || `Error del servidor (HTTP ${respuesta.status}).`);
    }
    if (!Array.isArray(datos.historico) || !Array.isArray(datos.prediccion) || !datos.prediccion.length) {
      throw new Error("La API respondió sin datos suficientes para mostrar el pronóstico.");
    }

    crearGrafica(datos.historico, datos.prediccion);
    document.getElementById("proxima").textContent =
      formatoValor.format(datos.prediccion[0].prediccion);
    const maximo = datos.prediccion.reduce((mayor, punto) =>
      punto.prediccion > mayor.prediccion ? punto : mayor,
    );
    document.getElementById("maximo").textContent = formatoValor.format(maximo.prediccion);
    const horaUltimoDato = document.createElement("time");
    horaUltimoDato.dateTime = datos.ultima_observacion;
    horaUltimoDato.textContent = formatearTiempo(datos.ultima_observacion);
    document.getElementById("ultimo").replaceChildren(horaUltimoDato);
    mostrarEstado(
      `Actualizado · ${datos.confianza * 100}% de confianza · Último dato: ${formatearTiempo(datos.ultima_observacion, true)}`,
      "success",
    );
  } catch (error) {
    if (grafica) {
      grafica.destroy();
      grafica = null;
    }
    document.getElementById("proxima").textContent = "—";
    document.getElementById("maximo").textContent = "—";
    document.getElementById("ultimo").textContent = "—";
    mostrarEstado(`No fue posible cargar el pronóstico: ${error.message}`, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Actualizar";
  }
}

cargarPronostico();