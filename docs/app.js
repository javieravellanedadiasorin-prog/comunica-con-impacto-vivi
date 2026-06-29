const CONFIG = window.ECOSPEAK_CONFIG || {};
const APP_VERSION = CONFIG.APP_VERSION || "v3.19";
let EVENT_CODE = CONFIG.EVENT_CODE || "VIVI-DEMO-001";

const MIN_RECORDING_SECONDS = 30;
const MAX_RECORDING_SECONDS = 120;
const STORAGE_KEY = "comunica_con_impacto_history_v319";
const STORAGE_KEYS_TO_READ = [
  STORAGE_KEY,
  "comunica_con_impacto_history_v316",
  "comunica_con_impacto_history_v315",
  "comunica_con_impacto_history_v314",
  "comunica_con_impacto_history_v313",
  "ecospeak_history_v31"
];

let supabaseClient = null;
let evaluatorSession = { isLoggedIn: false, mode: "none" };

const challenges = [
  {
    id: "huella-carbono-qsc",
    phase: "Reto 1 de 3",
    title: "Huella de carbono en una empresa de calidad",
    description:
      "Explica qué es la huella de carbono y propone una acción concreta para reducirla en una empresa orientada a calidad, educación, laboratorios clínicos o bancos de sangre.",
    topic: "Huella de carbono",
    durationSeconds: 60,
    requiredConcepts: ["huella", "carbono", "reducir", "empresa"],
  },
  {
    id: "reciclaje-qsc",
    phase: "Reto 2 de 3",
    title: "Reciclaje y cultura ambiental en el trabajo",
    description:
      "Explica por qué el reciclaje debe ser parte de la cultura de una empresa. Incluye un ejemplo práctico y una acción sencilla para aplicar desde hoy.",
    topic: "Reciclaje",
    durationSeconds: 60,
    requiredConcepts: ["reciclaje", "residuos", "separar", "accion"],
  },
  {
    id: "atencion-cliente-qsc",
    phase: "Reto 3 de 3",
    title: "Atención al cliente con enfoque Quality Consulting",
    description:
      "Presenta una idea libre sobre atención al cliente. Conecta el servicio con confianza, calidad, soporte, SST y el impacto en laboratorios, bancos de sangre, médicos o pacientes.",
    topic: "Atención al cliente",
    durationSeconds: 60,
    requiredConcepts: ["cliente", "calidad", "servicio", "confianza"],
  },
];

const sustainabilityKeywords = [
  "sostenibilidad", "sostenible", "medio ambiente", "ambiental",
  "residuos", "reciclaje", "reciclar", "separar", "reutilizar", "reducir",
  "huella", "carbono", "emisiones", "energia", "agua", "plastico",
  "papel", "impacto", "consumo responsable", "empresa", "cultura",
  "compromiso", "ahorro", "calidad", "cliente", "servicio", "confianza",
  "soporte", "laboratorio", "laboratorios", "banco de sangre", "bancos de sangre",
  "paciente", "pacientes", "medico", "medicos", "sst", "seguridad", "salud"
];

const fillerPatternDefinitions = [
  { label: "eh / heee / eeeh", regex: "\\b(?:h*e{2,}h*|e{2,}h*|h+e+h*|eh+)\\b" },
  { label: "mmm / hummm / ummm", regex: "\\b(?:m{2,}|h+u*m{2,}|u+m{2,}|e*m{2,}|h*m{2,})\\b" },
  { label: "este / esteee", regex: "\\beste+\\b" },
  { label: "pues / pos / pus", regex: "\\b(?:pues|pos|pus)\\b" },
  { label: "o sea / osea", regex: "\\bo\\s*sea\\b|\\bosea\\b" },
  { label: "digamos / digamos que", regex: "\\bdigamos(?:\\s+que)?\\b" },
  { label: "entonces", regex: "\\bentonces\\b" },
  { label: "bueno", regex: "\\bbueno\\b" },
  { label: "como que / como tal", regex: "\\bcomo\\s+(?:que|tal)\\b" },
  { label: "tipo", regex: "\\btipo\\b" },
  { label: "literal / literalmente", regex: "\\bliteral(?:mente)?\\b" },
  { label: "básicamente", regex: "\\bbasicamente\\b" },
  { label: "la verdad", regex: "\\bla\\s+verdad\\b" },
  { label: "no sé / no se", regex: "\\bno\\s+se\\b" },
  { label: "sí sí / sí sí sí", regex: "\\bsi\\s+si(?:\\s+si)*\\b" },
  { label: "no no / no no no", regex: "\\bno\\s+no(?:\\s+no)*\\b" },
  { label: "¿verdad?", regex: "\\bverdad\\b" },
  { label: "¿me explico?", regex: "\\bme\\s+explico\\b" },
  { label: "¿me entiendes?", regex: "\\bme\\s+entiendes\\b" },
  { label: "¿sabes?", regex: "\\bsabes\\b" },
  { label: "ajá / aja", regex: "\\baja\\b" },
  { label: "vale", regex: "\\bvale\\b" },
  { label: "listo", regex: "\\blisto\\b" },
  { label: "ok", regex: "\\bok\\b" },
  { label: "órale", regex: "\\borale\\b" },
  { label: "alargamientos de sonido", regex: "\\b[a-zñ]*([aeioumnrs])\\1{2,}[a-zñ]*\\b" }
];

const structurePatterns = {
  problem: ["problema", "actualmente", "hoy", "riesgo", "dificultad", "situacion", "desperdicio"],
  impact: ["impacto", "afecta", "genera", "provoca", "consecuencia", "costo", "contaminacion", "emisiones", "confianza", "seguridad"],
  solution: ["solucion", "podemos", "propongo", "implementar", "mejorar", "reducir", "reutilizar", "separar", "reciclar"],
  action: ["desde hoy", "compromiso", "accion", "debemos", "vamos a", "invito", "recomiendo", "propongo"]
};

let state = {
  alias: "",
  mode: "voice",
  currentChallengeIndex: 0,
  startedAt: null,
  endedAt: null,
  timerInterval: null,
  mediaRecorder: null,
  mediaStream: null,
  recognition: null,
  recognitionTranscript: "",
  recognitionFinalText: "",
  recognitionLastInterim: "",
  recognitionRestartCount: 0,
  manualTranscriptTouched: false,
  audioChunks: [],
  audioBlob: null,
  audioUrl: null,
  audioMimeType: "",
  audioContext: null,
  analyser: null,
  micLevelAnimation: null,
  isRecording: false,
  latestResult: null,
  dashboardRows: [],
  history: loadHistory()
};

const $ = (id) => document.getElementById(id);

const versionLabel = $("versionLabel");
const storageStatus = $("storageStatus");
const roleStatus = $("roleStatus");
const buildInsidePanel = $("buildInsidePanel");

const openStudentBtn = $("openStudentBtn");
const openEvaluatorBtn = $("openEvaluatorBtn");

const qrPanel = $("qrPanel");
const publicUrlInput = $("publicUrlInput");
const generateQrBtn = $("generateQrBtn");
const copyQrUrlBtn = $("copyQrUrlBtn");
const qrCanvas = $("qrCanvas");
const qrStatus = $("qrStatus");
const qrUrlLabel = $("qrUrlLabel");

const studentSetupPanel = $("studentSetupPanel");
const challengePanel = $("challengePanel");
const resultPanel = $("resultPanel");
const evaluatorPanel = $("evaluatorPanel");
const statsDashboardPanel = $("statsDashboardPanel");
const historyPanel = $("historyPanel");

const studentAlias = $("studentAlias");
const eventCodeInput = $("eventCodeInput");
const challengeSelect = $("challengeSelect");
const accessMode = $("accessMode");
const startStudentBtn = $("startStudentBtn");

const phaseLabel = $("phaseLabel");
const timerLabel = $("timerLabel");
const challengeTitle = $("challengeTitle");
const challengeDescription = $("challengeDescription");
const challengeTopic = $("challengeTopic");

const recordBtn = $("recordBtn");
const stopBtn = $("stopBtn");
const micTestBtn = $("micTestBtn");
const evaluateBtn = $("evaluateBtn");
const changeChallengeBtn = $("changeChallengeBtn");
const transcriptInput = $("transcriptInput");
const fillerPreviewText = $("fillerPreviewText");
const liveTranscript = $("liveTranscript");
const speechSupportMessage = $("speechSupportMessage");
const micLevelBar = $("micLevelBar");
const micDiagnosticText = $("micDiagnosticText");
const audioPlayback = $("audioPlayback");
const downloadAudioLink = $("downloadAudioLink");

const levelsList = $("levelsList");
const totalScore = $("totalScore");
const levelName = $("levelName");
const validationCode = $("validationCode");
const saveStatus = $("saveStatus");
const communicationScores = $("communicationScores");
const sustainabilityScores = $("sustainabilityScores");
const feedbackText = $("feedbackText");
const alignmentCriterionText = $("alignmentCriterionText");
const detailedImprovementReport = $("detailedImprovementReport");
const badgesList = $("badgesList");
const newAttemptBtn = $("newAttemptBtn");
const downloadPdfBtn = $("downloadPdfBtn");
const downloadJsonBtn = $("downloadJsonBtn");

const evaluatorEmail = $("evaluatorEmail");
const evaluatorPassword = $("evaluatorPassword");
const dashboardEventCode = $("dashboardEventCode");
const loginEvaluatorBtn = $("loginEvaluatorBtn");
const logoutEvaluatorBtn = $("logoutEvaluatorBtn");
const evaluatorLoginStatus = $("evaluatorLoginStatus");
const evaluatorDataCard = $("evaluatorDataCard");
const evaluatorResponsesCard = $("evaluatorResponsesCard");
const evaluatorActionsCard = $("evaluatorActionsCard");
const evaluatorDeleteCard = $("evaluatorDeleteCard");
const evaluatorFullReportCard = $("evaluatorFullReportCard");
const refreshDashboardBtn = $("refreshDashboardBtn");
const openStatsDashboardBtn = $("openStatsDashboardBtn");
const closeStatsDashboardBtn = $("closeStatsDashboardBtn");
const dashboardMetrics = $("dashboardMetrics");
const responsesTable = $("responsesTable");
const deleteStudentSelect = $("deleteStudentSelect");
const deleteResponseSelect = $("deleteResponseSelect");
const deleteSelectedResponseBtn = $("deleteSelectedResponseBtn");
const deleteAllStudentResponsesBtn = $("deleteAllStudentResponsesBtn");
const deleteResponseStatus = $("deleteResponseStatus");
const reportStudentSelect = $("reportStudentSelect");
const reportResponseSelect = $("reportResponseSelect");
const viewSavedReportBtn = $("viewSavedReportBtn");
const downloadSavedReportJsonBtn = $("downloadSavedReportJsonBtn");
const savedReportViewer = $("savedReportViewer");
const forceAppendTranscriptBtn = $("forceAppendTranscriptBtn");
const clearTranscriptBtn = $("clearTranscriptBtn");
const goDeletePanelBtn = $("goDeletePanelBtn");

const dashTotalResponses = $("dashTotalResponses");
const dashAverageTotal = $("dashAverageTotal");
const dashAverageCommunication = $("dashAverageCommunication");
const dashAverageSustainability = $("dashAverageSustainability");
const dimensionBars = $("dimensionBars");
const levelDistribution = $("levelDistribution");
const challengeAverages = $("challengeAverages");
const dashboardExecutiveSummary = $("dashboardExecutiveSummary");

const historyList = $("historyList");

window.addEventListener("load", async () => {
  versionLabel.textContent = APP_VERSION;
  buildInsidePanel.textContent = `${CONFIG.APP_NAME || "Comunica con impacto"} · ${APP_VERSION}`;
  eventCodeInput.value = EVENT_CODE;
  dashboardEventCode.value = EVENT_CODE;

  evaluatorEmail.value = "";
  evaluatorPassword.value = "";

  const defaultUrl = CONFIG.PUBLIC_APP_URL || window.location.href.split("#")[0].split("?")[0];
  publicUrlInput.value = defaultUrl;
  drawQr(defaultUrl);
  qrUrlLabel.textContent = defaultUrl;

  populateChallengeSelect();
  initSupabase();
  await ensureStudentSession();

  renderHistory();
  lockEvaluatorPanel();
  showStudentHome();
});

openStudentBtn.addEventListener("click", showStudentHome);
openEvaluatorBtn.addEventListener("click", showEvaluatorPanel);
generateQrBtn.addEventListener("click", () => {
  const url = publicUrlInput.value.trim();
  if (!url) {
    qrStatus.textContent = "Pega una URL para generar el QR.";
    return;
  }
  drawQr(url);
  qrUrlLabel.textContent = url;
  qrStatus.textContent = "QR actualizado.";
});

copyQrUrlBtn.addEventListener("click", async () => {
  const url = publicUrlInput.value.trim();
  try {
    await navigator.clipboard.writeText(url);
    qrStatus.textContent = "URL copiada.";
  } catch {
    qrStatus.textContent = "No se pudo copiar. Copia manualmente la URL.";
  }
});

startStudentBtn.addEventListener("click", () => {
  state.alias = studentAlias.value.trim() || "Participante anónimo";
  state.mode = accessMode.value;
  state.currentChallengeIndex = Number(challengeSelect.value || 0);
  EVENT_CODE = eventCodeInput.value.trim() || EVENT_CODE;
  dashboardEventCode.value = EVENT_CODE;

  resultPanel.classList.add("hidden");
  studentSetupPanel.classList.add("hidden");
  qrPanel.classList.add("hidden");
  evaluatorPanel.classList.add("hidden");
  challengePanel.classList.remove("hidden");
  roleStatus.textContent = "Participante";

  loadChallenge();
});

recordBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", () => stopRecording(false));
micTestBtn.addEventListener("click", runMicDiagnostic);
transcriptInput.addEventListener("input", () => {
  state.manualTranscriptTouched = true;
  updateFillerPreview();
});

evaluateBtn.addEventListener("click", async () => {
  const text = transcriptInput.value.trim();
  const challenge = challenges[state.currentChallengeIndex];

  state.endedAt = state.endedAt || new Date();

  let result;

  if (!text) {
    if (!state.audioBlob) {
      alert("No hay transcripción ni audio grabado. Graba una respuesta o escribe la transcripción literal.");
      return;
    }

    liveTranscript.textContent =
      "No hay transcripción literal. Se generará un análisis limitado basado solo en duración, volumen y pausas del audio.";
    result = await evaluateAudioOnly(challenge);
  } else {
    result = await evaluateAnswer(text, challenge);
  }

  state.latestResult = result;
  saveResultLocal(result);
  renderResult(result);

  challengePanel.classList.add("hidden");
  resultPanel.classList.remove("hidden");

  await saveResultRemote(result);
});

changeChallengeBtn.addEventListener("click", () => {
  stopRecording(true);
  state.currentChallengeIndex = (state.currentChallengeIndex + 1) % challenges.length;
  challengeSelect.value = String(state.currentChallengeIndex);
  loadChallenge();
});

newAttemptBtn.addEventListener("click", showStudentHome);
downloadPdfBtn.addEventListener("click", downloadPdfReport);
downloadJsonBtn.addEventListener("click", downloadJsonReport);

loginEvaluatorBtn.addEventListener("click", loginEvaluator);
logoutEvaluatorBtn.addEventListener("click", logoutEvaluator);
refreshDashboardBtn.addEventListener("click", loadEvaluatorDashboard);
openStatsDashboardBtn.addEventListener("click", openStatsDashboard);
closeStatsDashboardBtn.addEventListener("click", closeStatsDashboard);
goDeletePanelBtn.addEventListener("click", () => evaluatorDeleteCard.scrollIntoView({ behavior: "smooth", block: "start" }));
deleteStudentSelect.addEventListener("change", filterDeleteResponsesByStudent);
deleteSelectedResponseBtn.addEventListener("click", deleteSelectedResponse);
deleteAllStudentResponsesBtn.addEventListener("click", deleteAllStudentResponses);
reportStudentSelect.addEventListener("change", filterReportResponsesByStudent);
viewSavedReportBtn.addEventListener("click", viewSavedReport);
downloadSavedReportJsonBtn.addEventListener("click", downloadSavedReportJson);
forceAppendTranscriptBtn.addEventListener("click", forceAppendCurrentTranscript);
clearTranscriptBtn.addEventListener("click", clearTranscriptManually);

function populateChallengeSelect() {
  challengeSelect.innerHTML = challenges
    .map((challenge, index) => `<option value="${index}">${index + 1}. ${escapeHtml(challenge.topic)}</option>`)
    .join("");
}

function showStudentHome() {
  stopRecording(true);
  evaluatorPanel.classList.add("hidden");
  statsDashboardPanel.classList.add("hidden");
  challengePanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  studentSetupPanel.classList.remove("hidden");
  qrPanel.classList.remove("hidden");
  historyPanel.classList.remove("hidden");
  roleStatus.textContent = "Participante";
}

function showEvaluatorPanel() {
  stopRecording(true);
  studentSetupPanel.classList.add("hidden");
  qrPanel.classList.add("hidden");
  challengePanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  statsDashboardPanel.classList.add("hidden");
  historyPanel.classList.add("hidden");
  evaluatorPanel.classList.remove("hidden");

  if (evaluatorSession.isLoggedIn) {
    unlockEvaluatorPanel();
  } else {
    lockEvaluatorPanel();
  }

  roleStatus.textContent = "Panel evaluador";
}

function loadChallenge() {
  const challenge = challenges[state.currentChallengeIndex];

  state.startedAt = null;
  state.endedAt = null;
  state.audioChunks = [];
  state.audioBlob = null;
  state.audioMimeType = "";

  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = null;
  }

  transcriptInput.value = "";
  state.recognitionTranscript = "";
  state.recognitionFinalText = "";
  state.recognitionLastInterim = "";
  state.recognitionRestartCount = 0;
  state.manualTranscriptTouched = false;
  updateFillerPreview();
  liveTranscript.textContent = "La app intentará transcribir mientras grabas. Si el navegador no lo permite, escribe o corrige manualmente.";
  micDiagnosticText.textContent = "Aún no se ha probado el micrófono.";
  micLevelBar.style.width = "0%";
  timerLabel.textContent = "00:00";
  audioPlayback.pause();
  audioPlayback.classList.add("hidden");
  audioPlayback.removeAttribute("src");
  audioPlayback.load();
  downloadAudioLink.classList.add("hidden");
  downloadAudioLink.removeAttribute("href");

  phaseLabel.textContent = challenge.phase;
  challengeTitle.textContent = challenge.title;
  challengeDescription.textContent = challenge.description;
  challengeTopic.textContent = `Tema: ${challenge.topic}`;

  if (state.mode === "text") {
    recordBtn.disabled = true;
    stopBtn.disabled = true;
    micTestBtn.disabled = true;
    speechSupportMessage.textContent = "Modo texto activo. Escribe tu respuesta literal y presiona Evaluar.";
  } else {
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    micTestBtn.disabled = false;
    speechSupportMessage.textContent = getSpeechSupportMessage();
  }
}

async function startRecording() {
  if (state.mode === "text") return;

  if (!isSecureMicContext()) {
    speechSupportMessage.textContent = "El micrófono requiere HTTPS o localhost.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    speechSupportMessage.textContent = "Este navegador no permite acceso al micrófono. Usa Chrome, Safari actualizado o modo texto.";
    return;
  }

  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = null;
  }

  state.startedAt = new Date();
  state.endedAt = null;
  state.isRecording = true;
  state.audioChunks = [];
  state.audioBlob = null;
  state.audioMimeType = "";

  recordBtn.disabled = true;
  stopBtn.disabled = false;
  recordBtn.textContent = "Grabando...";
  audioPlayback.pause();
  audioPlayback.classList.add("hidden");
  audioPlayback.removeAttribute("src");
  audioPlayback.load();
  downloadAudioLink.classList.add("hidden");
  downloadAudioLink.removeAttribute("href");

  startTimer();

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const audioTracks = state.mediaStream.getAudioTracks();

    if (!audioTracks.length) {
      throw new Error("No se recibió pista de audio.");
    }

    micDiagnosticText.textContent = `Micrófono activo: ${audioTracks[0].label || "dispositivo de entrada"}.`;
    liveTranscript.textContent = "Grabación activa. Intentando transcripción automática preliminar...";
    speechSupportMessage.textContent = `Grabando. Mínimo ${MIN_RECORDING_SECONDS} s, máximo ${MAX_RECORDING_SECONDS} s.`;

    startMicLevelMeter(state.mediaStream);
    startAudioRecording(state.mediaStream);
    startSpeechRecognitionOptional();

  } catch (error) {
    console.error(error);
    const message = translateMicAccessError(error);
    speechSupportMessage.textContent = message;
    micDiagnosticText.textContent = message;
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordBtn.textContent = "Grabar respuesta";
    state.isRecording = false;
    stopTimer();
  }
}


function startSpeechRecognitionOptional() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!Recognition) {
    liveTranscript.textContent =
      "Este navegador no soporta transcripción automática. El audio sí se grabará; escribe la transcripción en el cuadro.";
    return;
  }

  try {
    if (state.recognition) {
      try { state.recognition.stop(); } catch {}
      state.recognition = null;
    }

    state.recognition = new Recognition();
    state.recognition.lang = "es-CO";
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.maxAlternatives = 1;

    state.recognition.onstart = () => {
      liveTranscript.textContent =
        "Transcripción automática activa. Habla claro; luego corrige el texto contra el audio antes de evaluar.";
    };

    state.recognition.onresult = (event) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = (event.results[i][0]?.transcript || "").trim();

        if (!chunk) continue;

        if (event.results[i].isFinal) {
          state.recognitionFinalText = appendUniqueTranscript(state.recognitionFinalText, chunk);
        } else {
          interim = appendUniqueTranscript(interim, chunk);
        }
      }

      state.recognitionLastInterim = interim;
      state.recognitionTranscript = `${state.recognitionFinalText} ${state.recognitionLastInterim}`.replace(/\s+/g, " ").trim();

      liveTranscript.textContent = state.recognitionTranscript || "Escuchando...";

      // El cuadro de evaluación siempre recibe la transcripción automática si el usuario no la está editando.
      if (!state.manualTranscriptTouched || !transcriptInput.value.trim()) {
        transcriptInput.value = state.recognitionTranscript;
        updateFillerPreview();
      }
    };

    state.recognition.onerror = (event) => {
      const error = event.error || "desconocido";

      if (["no-speech", "audio-capture", "network"].includes(error) && state.isRecording) {
        liveTranscript.textContent =
          `Transcripción interrumpida (${error}). Reintentando sin detener la grabación...`;
        return;
      }

      liveTranscript.textContent =
        `La transcripción automática falló (${error}). El audio sí se graba; escribe o corrige manualmente en el cuadro.`;
    };

    state.recognition.onend = () => {
      if (state.isRecording) {
        state.recognitionRestartCount += 1;
        setTimeout(() => {
          try {
            if (state.isRecording && state.recognition) {
              state.recognition.start();
            }
          } catch {}
        }, 250);
        return;
      }

      // Al detener, congelamos lo último capturado en el cuadro si sigue vacío.
      const finalText = `${state.recognitionFinalText} ${state.recognitionLastInterim}`.replace(/\s+/g, " ").trim();
      if (finalText && !transcriptInput.value.trim()) {
        transcriptInput.value = finalText;
        updateFillerPreview();
      }

      state.recognition = null;
    };

    state.recognition.start();
  } catch (error) {
    console.warn("SpeechRecognition failed", error);
    liveTranscript.textContent =
      "No se pudo iniciar la transcripción automática. El audio sí se graba; escribe manualmente en el cuadro.";
    state.recognition = null;
  }
}

function appendUniqueTranscript(base, addition) {
  const cleanBase = String(base || "").trim();
  const cleanAddition = String(addition || "").trim();

  if (!cleanAddition) return cleanBase;
  if (!cleanBase) return cleanAddition;

  const normalizedBase = normalizeText(cleanBase);
  const normalizedAddition = normalizeText(cleanAddition);

  if (normalizedBase.endsWith(normalizedAddition)) {
    return cleanBase;
  }

  const baseWords = cleanBase.split(/\s+/);
  const addWords = cleanAddition.split(/\s+/);
  const maxOverlap = Math.min(baseWords.length, addWords.length, 12);

  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    const tail = normalizeText(baseWords.slice(-overlap).join(" "));
    const head = normalizeText(addWords.slice(0, overlap).join(" "));

    if (tail && tail === head) {
      return `${cleanBase} ${addWords.slice(overlap).join(" ")}`.replace(/\s+/g, " ").trim();
    }
  }

  return `${cleanBase} ${cleanAddition}`.replace(/\s+/g, " ").trim();
}

function forceAppendCurrentTranscript() {
  const live = liveTranscript.textContent.trim();

  if (!live || live.includes("Transcripción automática") || live.includes("navegador no soporta")) {
    return;
  }

  const current = transcriptInput.value.trim();
  transcriptInput.value = appendUniqueTranscript(current, live);
  state.manualTranscriptTouched = true;
  updateFillerPreview();
}

function clearTranscriptManually() {
  const confirmed = confirm("¿Seguro que deseas limpiar la transcripción?");
  if (!confirmed) return;

  transcriptInput.value = "";
  state.recognitionTranscript = "";
  state.recognitionFinalText = "";
  state.recognitionLastInterim = "";
  state.manualTranscriptTouched = false;
  updateFillerPreview();
}


function getBestAudioRecorderOptions() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus"
  ];

  if (!("MediaRecorder" in window)) {
    return null;
  }

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType };
    }
  }

  return {};
}

function getAudioExtension(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function startAudioRecording(stream) {
  if (!("MediaRecorder" in window)) {
    micDiagnosticText.textContent = "El navegador detectó micrófono, pero no soporta MediaRecorder. Usa modo texto.";
    return;
  }

  try {
    const options = getBestAudioRecorderOptions();

    if (options === null) {
      throw new Error("MediaRecorder no disponible.");
    }

    state.mediaRecorder = new MediaRecorder(stream, options);
    state.audioMimeType = state.mediaRecorder.mimeType || options.mimeType || "audio/webm";
    state.audioChunks = [];

    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    state.mediaRecorder.onerror = () => {
      micDiagnosticText.textContent = "La grabación presentó un error. Reintenta o usa modo texto.";
    };

    state.mediaRecorder.onstop = () => {
      const mimeType = state.audioMimeType || "audio/webm";

      if (!state.audioChunks.length) {
        micDiagnosticText.textContent = "La grabación finalizó sin datos de audio.";
        return;
      }

      state.audioBlob = new Blob(state.audioChunks, { type: mimeType });
      state.audioUrl = URL.createObjectURL(state.audioBlob);

      audioPlayback.src = state.audioUrl;
      audioPlayback.classList.remove("hidden");
      audioPlayback.load();

      const extension = getAudioExtension(mimeType);
      downloadAudioLink.href = state.audioUrl;
      downloadAudioLink.download = `comunica-audio-${Date.now()}.${extension}`;
      downloadAudioLink.classList.remove("hidden");

      micDiagnosticText.textContent =
        `Grabación finalizada. Tamaño: ${Math.round(state.audioBlob.size / 1024)} KB. Formato: ${mimeType}. Reproduce el audio y transcribe literalmente.`;
    };

    state.mediaRecorder.start(1000);
  } catch (error) {
    console.warn(error);
    micDiagnosticText.textContent = "El micrófono se detectó, pero la grabación de audio falló. Usa modo texto.";
  }
}

function stopRecording(forceStop = false) {
  if (!state.isRecording && !state.mediaRecorder) return;

  const elapsed = state.startedAt ? Math.floor((new Date() - state.startedAt) / 1000) : 0;

  if (state.isRecording && !forceStop && elapsed < MIN_RECORDING_SECONDS) {
    const remaining = MIN_RECORDING_SECONDS - elapsed;
    speechSupportMessage.textContent = `La grabación mínima es de ${MIN_RECORDING_SECONDS} segundos. Faltan ${remaining} s.`;
    return;
  }

  state.endedAt = new Date();
  state.isRecording = false;

  recordBtn.disabled = false;
  stopBtn.disabled = true;
  recordBtn.textContent = "Grabar respuesta";

  stopTimer();

  const finalRecognitionText = `${state.recognitionFinalText || ""} ${state.recognitionLastInterim || ""}`.replace(/\s+/g, " ").trim();

  if (finalRecognitionText && !state.manualTranscriptTouched) {
    transcriptInput.value = finalRecognitionText;
    updateFillerPreview();
  }

  if (state.recognition) {
    try { state.recognition.stop(); } catch {}
  }

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    try {
      state.mediaRecorder.requestData();
      state.mediaRecorder.stop();
    } catch {}
  }

  stopMicLevelMeter();

  setTimeout(() => {
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach((track) => track.stop());
    }
    state.mediaStream = null;
  }, 300);

  liveTranscript.textContent = transcriptInput.value.trim()
    ? "Grabación detenida. Revisa la transcripción contra el audio antes de evaluar."
    : "Grabación detenida. No se obtuvo transcripción automática; reproduce el audio y escribe la respuesta.";
  speechSupportMessage.textContent = "Grabación detenida. Revisa o completa la transcripción antes de evaluar.";
}

async function runMicDiagnostic() {
  if (!isSecureMicContext()) {
    micDiagnosticText.textContent = "En celular el micrófono exige HTTPS.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    micDiagnosticText.textContent = "Este navegador no permite acceso al micrófono.";
    return;
  }

  try {
    micDiagnosticText.textContent = "Probando acceso al micrófono...";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tracks = stream.getAudioTracks();

    micDiagnosticText.textContent = `Micrófono OK: ${tracks[0]?.label || "dispositivo de entrada"}. Habla 5 segundos y revisa la barra.`;
    startMicLevelMeter(stream);

    setTimeout(() => {
      stopMicLevelMeter();
      stream.getTracks().forEach((track) => track.stop());
      micLevelBar.style.width = "0%";
      micDiagnosticText.textContent += " Prueba finalizada.";
    }, 5000);
  } catch (error) {
    micDiagnosticText.textContent = translateMicAccessError(error);
  }
}

function startMicLevelMeter(stream) {
  stopMicLevelMeter();

  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;

    source.connect(state.analyser);
    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);

    const update = () => {
      if (!state.analyser) return;

      state.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const percent = Math.min(100, Math.round((average / 90) * 100));

      micLevelBar.style.width = `${percent}%`;
      state.micLevelAnimation = requestAnimationFrame(update);
    };

    update();
  } catch {}
}

function stopMicLevelMeter() {
  if (state.micLevelAnimation) {
    cancelAnimationFrame(state.micLevelAnimation);
    state.micLevelAnimation = null;
  }

  if (state.audioContext) {
    try { state.audioContext.close(); } catch {}
  }

  state.audioContext = null;
  state.analyser = null;
}

function startTimer() {
  stopTimer();

  state.timerInterval = setInterval(() => {
    if (!state.startedAt) return;
    const seconds = Math.floor((new Date() - state.startedAt) / 1000);
    timerLabel.textContent = formatSeconds(seconds);

    if (state.isRecording && seconds < MIN_RECORDING_SECONDS) {
      const remaining = MIN_RECORDING_SECONDS - seconds;
      speechSupportMessage.textContent = `Grabando. Tiempo mínimo: ${MIN_RECORDING_SECONDS} s. Faltan ${remaining} s.`;
    }

    if (state.isRecording && seconds >= MIN_RECORDING_SECONDS && seconds < MAX_RECORDING_SECONDS) {
      speechSupportMessage.textContent = `Grabación válida. Puedes detener cuando termines. Máximo: ${MAX_RECORDING_SECONDS} s.`;
    }

    if (state.isRecording && seconds >= MAX_RECORDING_SECONDS) {
      speechSupportMessage.textContent = `Se alcanzó el máximo de ${MAX_RECORDING_SECONDS} s. Grabación detenida automáticamente.`;
      stopRecording(true);
    }
  }, 500);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}


async function evaluateAudioOnly(challenge) {
  const metrics = await analyzeAudioBlob(state.audioBlob);
  const durationSeconds = metrics.durationSeconds || getDurationSeconds();

  const durationScore = durationSeconds >= MIN_RECORDING_SECONDS && durationSeconds <= MAX_RECORDING_SECONDS
    ? 85
    : 45;

  const activeRatioPercent = Math.round((metrics.activeRatio || 0) * 100);
  const pausePenalty = metrics.longestSilenceSeconds > 4 ? 20 : metrics.longestSilenceSeconds > 2.5 ? 10 : 0;
  const fluencyScore = clamp(Math.round(activeRatioPercent * 1.1) - pausePenalty, 25, 90);

  const volumeScore = metrics.rmsDb > -35 && metrics.rmsDb < -12
    ? 85
    : metrics.rmsDb >= -12
      ? 65
      : 55;

  const communicationScore = Math.round(durationScore * 0.35 + fluencyScore * 0.40 + volumeScore * 0.25);
  const sustainabilityScore = 20;
  const total = Math.min(55, Math.round(communicationScore * 0.65 + sustainabilityScore * 0.35));
  const level = getLevel(total);

  const text = "[Sin transcripción literal: análisis limitado basado únicamente en el audio grabado.]";

  const rhythm = {
    score: fluencyScore,
    label: "Análisis acústico limitado",
    message: `Audio útil estimado: ${metrics.activeSeconds.toFixed(1)} s de ${metrics.durationSeconds.toFixed(1)} s. Pausas/silencios: ${metrics.silenceSeconds.toFixed(1)} s.`
  };

  const clarity = {
    score: volumeScore,
    label: "Claridad acústica estimada",
    avgWordsPerSentence: 0
  };

  const structure = {
    score: 0,
    achieved: 0,
    present: [],
    missing: ["problema", "impacto", "solución", "acción concreta"],
    problem: false,
    impact: false,
    solution: false,
    action: false
  };

  const sustainability = {
    keywordHits: [],
    requiredHits: [],
    missingRequired: challenge.requiredConcepts,
    businessScore: 0,
    actionScore: 0,
    impactScore: 0,
    conceptScore: 0,
    hasBusinessContext: false,
    hasAction: false,
    hasImpact: false
  };

  const persuasion = { score: 0, hits: [], label: "No evaluable sin transcripción" };
  const concision = { score: durationScore, label: "Duración de audio evaluada" };
  const orthography = {
    score: 0,
    label: "No evaluable sin transcripción",
    issues: ["No hubo texto para revisar."],
    summary: "No es posible hacer revisión ortográfica sin transcripción.",
    readableSuggestion: "No disponible sin transcripción."
  };

  const base = {
    appVersion: APP_VERSION,
    eventCode: EVENT_CODE,
    alias: state.alias,
    date: new Date().toISOString(),
    phase: challenge.phase,
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    topic: challenge.topic,
    text,
    audioOnly: true,
    audioMetrics: metrics,
    durationSeconds,
    wordCount: 0,
    wordsPerMinute: 0,
    fillerCount: 0,
    fillerDetails: [],
    strictNotes: [
      "No hubo transcripción literal; por eso no se evaluaron contenido, muletillas, estructura verbal ni sostenibilidad.",
      "El puntaje máximo queda limitado a 55/100 hasta que exista transcripción literal o backend de transcripción especializada."
    ],
    communicationScore,
    sustainabilityScore,
    total,
    level,
    detail: { rhythm, clarity, orthography, structure, sustainability, persuasion, concision }
  };

  const validation = await createValidationCode(base);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    validationCode: validation,
    audioRecorded: Boolean(state.audioBlob),
    audioSizeBytes: state.audioBlob ? state.audioBlob.size : 0,
    audioMimeType: state.audioMimeType,
    badges: ["Audio grabado", "Análisis limitado"],
    feedback:
      `La grabación sí fue tomada. Duró ${metrics.durationSeconds.toFixed(1)} segundos. ` +
      `El audio útil estimado fue ${metrics.activeSeconds.toFixed(1)} segundos y las pausas/silencios fueron ${metrics.silenceSeconds.toFixed(1)} segundos. ` +
      `Como no se escribió transcripción literal, no es posible detectar muletillas ni evaluar contenido con precisión. ` +
      `Para análisis completo, reproduce el audio y escribe literalmente lo dicho.`,
    detailedReport: buildAudioOnlyDetailedReport({ metrics, durationScore, fluencyScore, volumeScore, challenge }),
    ...base
  };
}

async function analyzeAudioBlob(blob) {
  const fallback = {
    durationSeconds: getDurationSeconds(),
    activeSeconds: 0,
    silenceSeconds: 0,
    activeRatio: 0,
    longestSilenceSeconds: 0,
    rmsDb: -99,
    peakDb: -99
  };

  if (!blob || !window.AudioContext && !window.webkitAudioContext) {
    return fallback;
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const durationSeconds = audioBuffer.duration;

    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]);
      sumSquares += v * v;
      if (v > peak) peak = v;
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, data.length));
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -99;
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -99;

    const windowSize = Math.max(1, Math.floor(sampleRate * 0.2));
    const threshold = Math.max(0.006, rms * 0.35);

    let activeWindows = 0;
    let silenceWindows = 0;
    let currentSilence = 0;
    let longestSilenceWindows = 0;

    for (let start = 0; start < data.length; start += windowSize) {
      const end = Math.min(data.length, start + windowSize);
      let localSquares = 0;

      for (let i = start; i < end; i++) {
        localSquares += data[i] * data[i];
      }

      const localRms = Math.sqrt(localSquares / Math.max(1, end - start));

      if (localRms > threshold) {
        activeWindows += 1;
        if (currentSilence > longestSilenceWindows) longestSilenceWindows = currentSilence;
        currentSilence = 0;
      } else {
        silenceWindows += 1;
        currentSilence += 1;
      }
    }

    if (currentSilence > longestSilenceWindows) longestSilenceWindows = currentSilence;

    const totalWindows = Math.max(1, activeWindows + silenceWindows);
    const activeSeconds = activeWindows * 0.2;
    const silenceSeconds = Math.max(0, durationSeconds - activeSeconds);
    const activeRatio = activeWindows / totalWindows;
    const longestSilenceSeconds = longestSilenceWindows * 0.2;

    try { await audioContext.close(); } catch {}

    return {
      durationSeconds,
      activeSeconds,
      silenceSeconds,
      activeRatio,
      longestSilenceSeconds,
      rmsDb,
      peakDb
    };
  } catch (error) {
    console.warn("Audio analysis failed", error);
    return fallback;
  }
}

function buildAudioOnlyDetailedReport(data) {
  const metrics = data.metrics;

  return {
    communication: [
      {
        item: "Grabación tomada",
        score: data.durationScore,
        interpretation: "El audio sí fue capturado por la app",
        evidence:
          `Duración: ${metrics.durationSeconds.toFixed(1)} s. ` +
          `Audio útil estimado: ${metrics.activeSeconds.toFixed(1)} s. ` +
          `Pausas/silencios: ${metrics.silenceSeconds.toFixed(1)} s.`,
        improvement:
          "La grabación funciona. La falla no es captura de audio; la falla es que sin transcripción literal no se puede evaluar contenido ni muletillas.",
        exercise:
          "Reproduce el audio grabado y escribe exactamente lo que dijiste en el cuadro de transcripción."
      },
      {
        item: "Fluidez acústica",
        score: data.fluencyScore,
        interpretation: "Evaluación basada en proporción de audio activo y pausas",
        evidence:
          `Proporción activa estimada: ${Math.round(metrics.activeRatio * 100)}%. ` +
          `Pausa más larga estimada: ${metrics.longestSilenceSeconds.toFixed(1)} s.`,
        improvement:
          "Reduce pausas largas y prepara una estructura corta antes de hablar: problema, impacto, solución y acción.",
        exercise:
          "Practica una respuesta de 45 segundos evitando silencios superiores a 2 segundos."
      },
      {
        item: "Volumen / señal",
        score: data.volumeScore,
        interpretation: "Estimación técnica de nivel de audio",
        evidence:
          `Volumen promedio estimado: ${metrics.rmsDb.toFixed(1)} dBFS. ` +
          `Pico estimado: ${metrics.peakDb.toFixed(1)} dBFS.`,
        improvement:
          "Habla a una distancia constante del micrófono. Evita acercarte demasiado si hay saturación o alejarte demasiado si el audio queda bajo.",
        exercise:
          "Haz una prueba de 10 segundos y revisa que la barra de micrófono se mueva sin llegar todo el tiempo al máximo."
      },
      {
        item: "Muletillas",
        score: 0,
        interpretation: "No evaluable sin transcripción literal",
        evidence:
          "La app no puede identificar heee, hummm, pues, o sea u otras muletillas directamente desde el audio usando solo navegador.",
        improvement:
          "Para detectar muletillas, escribe literalmente lo dicho o conecta un backend de transcripción especializado.",
        exercise:
          "Escucha el audio y escribe incluso sonidos como heee, hummm, mmm, eh y repeticiones como no no, del del."
      }
    ],
    sustainability: [
      {
        item: "Contenido del reto",
        score: 0,
        interpretation: "No evaluable sin texto",
        evidence:
          "No hubo transcripción literal para verificar conceptos del reto.",
        improvement:
          `Incluye conceptos del reto: ${data.challenge.requiredConcepts.join(", ")}.`,
        exercise:
          "Después de transcribir, verifica que aparezcan definición, ejemplo empresarial y acción concreta."
      },
      {
        item: "Aplicación al reto",
        score: 0,
        interpretation: "No evaluable sin texto",
        evidence:
          "No hubo transcripción literal para confirmar conexión con empresa, cliente, calidad, laboratorio, SST o servicio.",
        improvement:
          "Menciona explícitamente cómo aplica el tema en la empresa o frente al cliente.",
        exercise:
          "Agrega la frase: “En nuestro trabajo esto aplica cuando…”."
      },
      {
        item: "Acción concreta",
        score: 0,
        interpretation: "No evaluable sin texto",
        evidence:
          "No hubo transcripción literal para detectar una acción observable.",
        improvement:
          "Cierra con una conducta concreta y verificable.",
        exercise:
          "Termina con: “Desde hoy vamos a…”."
      },
      {
        item: "Impacto explicado",
        score: 0,
        interpretation: "No evaluable sin texto",
        evidence:
          "No hubo transcripción literal para detectar beneficio o consecuencia.",
        improvement:
          "Explica por qué importa la acción propuesta.",
        exercise:
          "Agrega: “Esto es importante porque…”."
      }
    ]
  };
}

async function evaluateAnswer(text, challenge) {
  const cleanText = normalizeText(text);
  const words = getWords(cleanText);
  const wordCount = words.length;
  const durationSeconds = getDurationSeconds();
  const wordsPerMinute = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0;

  const fillerDetails = getFillerDetails(cleanText);
  const fillerCount = fillerDetails.reduce((sum, item) => sum + item.count, 0);
  const audioMetrics = state.audioBlob ? await analyzeAudioBlob(state.audioBlob) : null;
  const transcriptValidation = validateTranscriptAgainstAudio({
    text,
    wordCount,
    durationSeconds,
    wordsPerMinute,
    fillerCount,
    audioMetrics
  });
  const structure = evaluateStructure(cleanText);
  const sustainability = evaluateSustainability(cleanText, challenge);
  const clarity = evaluateClarity(cleanText, wordCount);
  const rhythm = evaluateRhythm(wordsPerMinute);
  const concision = evaluateConcision(wordCount, challenge.durationSeconds);
  const persuasion = evaluatePersuasion(cleanText);
  const orthography = evaluateOrthography(text);

  let communicationScore = Math.round(
    rhythm.score * 0.18 +
    clarity.score * 0.22 +
    fillerScore(fillerCount) * 0.15 +
    structure.score * 0.30 +
    persuasion.score * 0.15
  );

  let sustainabilityScore = Math.round(
    sustainability.conceptScore * 0.40 +
    sustainability.businessScore * 0.20 +
    sustainability.actionScore * 0.25 +
    sustainability.impactScore * 0.15
  );

  let total = Math.round(communicationScore * 0.55 + sustainabilityScore * 0.45);

  const strict = applyStrictScoring({
    communicationScore,
    sustainabilityScore,
    total,
    wordCount,
    durationSeconds,
    structure,
    sustainability,
    fillerCount,
    challenge
  });

  communicationScore = strict.communicationScore;
  sustainabilityScore = strict.sustainabilityScore;
  total = strict.total;

  const level = getLevel(total);

  const base = {
    appVersion: APP_VERSION,
    eventCode: EVENT_CODE,
    alias: state.alias,
    date: new Date().toISOString(),
    phase: challenge.phase,
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    topic: challenge.topic,
    text,
    durationSeconds,
    wordCount,
    wordsPerMinute,
    fillerCount,
    fillerDetails,
    audioMetrics,
    transcriptValidation,
    strictNotes: strict.notes,
    communicationScore,
    sustainabilityScore,
    total,
    level,
    detail: { rhythm, clarity, orthography, structure, sustainability, persuasion, concision }
  };

  const validation = await createValidationCode(base);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    validationCode: validation,
    audioRecorded: Boolean(state.audioBlob),
    audioSizeBytes: state.audioBlob ? state.audioBlob.size : 0,
    audioMimeType: state.audioMimeType,
    audioMetrics,
    transcriptValidation,
    badges: getBadges({ total, rhythm, clarity, fillerCount, structure, sustainability, persuasion }),
    feedback: buildFeedback({
      wordCount, wordsPerMinute, fillerCount, rhythm, structure, sustainability, persuasion,
      transcriptValidation, audioMetrics, challenge, total, strictNotes: strict.notes
    }),
    detailedReport: buildDetailedImprovementReport({
      wordCount, wordsPerMinute, fillerCount, fillerDetails, strictNotes: strict.notes,
      rhythm, clarity, orthography, structure, sustainability, persuasion, concision,
      audioMetrics, transcriptValidation, challenge, total
    }),
    ...base
  };
}

function renderResult(result) {
  totalScore.textContent = `${result.total}/100`;
  levelName.textContent = result.level;
  validationCode.textContent = result.validationCode;
  saveStatus.textContent = "Guardando...";

  renderLevelExplanation(result.level);
  alignmentCriterionText.textContent = getChallengeCriteriaDescription({
    id: result.challengeId,
    topic: result.topic,
    requiredConcepts: challenges.find((item) => item.id === result.challengeId)?.requiredConcepts || []
  });
  renderScoreAccordions(result);
  feedbackText.textContent = result.feedback;
  renderDetailedImprovementReport(result.detailedReport);

  badgesList.innerHTML = result.badges.map((badge) => `<span class="medal">🏅 ${escapeHtml(badge)}</span>`).join("");
}

function renderLevelExplanation(currentLevel) {
  levelsList.innerHTML = getLevelDefinitions().map((level) => `
    <div class="level-item">
      <strong>${escapeHtml(level.name)}${level.name === currentLevel ? " · Nivel obtenido" : ""}</strong>
      <p><strong>Rango:</strong> ${escapeHtml(level.range)}/100. ${escapeHtml(level.description)}</p>
    </div>
  `).join("");
}

function renderScoreAccordions(result) {
  communicationScores.innerHTML = `
    <li><details><summary>Ritmo <span>${result.detail.rhythm.score}/100</span></summary><p>${escapeHtml(result.detail.rhythm.label)}. ${escapeHtml(result.detail.rhythm.message || "")}</p></details></li>
    <li><details open><summary>Validación audio vs transcripción <span>${result.transcriptValidation?.score ?? 0}/100</span></summary><p>${escapeHtml(result.transcriptValidation?.status || "No disponible.")}</p><p>${escapeHtml(result.transcriptValidation?.evidence || "")}</p><p>${escapeHtml((result.transcriptValidation?.warnings || []).join(" "))}</p></details></li>
    <li><details><summary>Claridad <span>${result.detail.clarity.score}/100</span></summary><p>${escapeHtml(result.detail.clarity.label)}. Promedio estimado: ${result.detail.clarity.avgWordsPerSentence} palabras por frase.</p></details></li>
    <li><details><summary>Ortografía y presentación <span>${result.detail.orthography?.score ?? 0}/100</span></summary><p>${escapeHtml(result.detail.orthography?.summary || "No disponible.")}</p><p class="readable-suggestion">${escapeHtml(result.detail.orthography?.readableSuggestion || "")}</p></details></li>
    <li><details open><summary>Muletillas <span>${result.fillerCount} detectada(s)</span></summary><p>${escapeHtml(formatFillerDetails(result.fillerDetails || []))}</p></details></li>
    <li><details><summary>Estructura <span>${result.detail.structure.score}/100</span></summary><p>Presentes: ${escapeHtml((result.detail.structure.present || []).join(", ") || "ninguno")}.</p><p>Faltantes: ${escapeHtml((result.detail.structure.missing || []).join(", ") || "ninguno")}.</p></details></li>
    <li><details><summary>Persuasión <span>${result.detail.persuasion.score}/100</span></summary><p>${escapeHtml(result.detail.persuasion.label)}. Señales detectadas: ${escapeHtml((result.detail.persuasion.hits || []).join(", ") || "ninguna")}.</p></details></li>
  `;

  sustainabilityScores.innerHTML = `
    <li><details><summary>Comprensión del reto <span>${result.detail.sustainability.conceptScore}/100</span></summary><p>Conceptos detectados: ${escapeHtml((result.detail.sustainability.requiredHits || []).join(", ") || "ninguno")}.</p><p>Conceptos faltantes: ${escapeHtml((result.detail.sustainability.missingRequired || []).join(", ") || "ninguno")}.</p></details></li>
    <li><details><summary>Aplicación al reto <span>${result.detail.sustainability.businessScore}/100</span></summary><p>${result.detail.sustainability.hasBusinessContext ? "Sí conectó con contexto empresarial." : "Faltó conectar con empresa, cliente, servicio, calidad, laboratorio, SST o proceso."}</p></details></li>
    <li><details><summary>Acción concreta <span>${result.detail.sustainability.actionScore}/100</span></summary><p>${result.detail.sustainability.hasAction ? "Sí incluyó una intención de acción." : "Faltó una acción observable y concreta."}</p></details></li>
    <li><details><summary>Impacto explicado <span>${result.detail.sustainability.impactScore}/100</span></summary><p>${result.detail.sustainability.hasImpact ? "Sí explicó impacto o beneficio." : "Faltó explicar por qué importa o qué mejora."}</p></details></li>
  `;
}

function renderDetailedImprovementReport(report) {
  const renderItems = (items) => items.map((item) => `
    <details class="detail-item">
      <summary><span><strong>${escapeHtml(item.item)}</strong> <span class="detail-score">${item.score}/100</span></span></summary>
      <p><strong>Lectura:</strong> ${escapeHtml(item.interpretation)}</p>
      <div class="evidence-box"><strong>Qué se detectó exactamente:</strong><p>${escapeHtml(item.evidence || "Sin evidencia específica disponible.")}</p></div>
      <p><strong>Cómo mejorar:</strong> ${escapeHtml(item.improvement)}</p>
      <p><strong>Práctica sugerida:</strong> ${escapeHtml(item.exercise)}</p>
    </details>
  `).join("");

  detailedImprovementReport.innerHTML = `
    <div class="detail-block"><h4>Comunicación</h4>${renderItems(report.communication)}</div>
    <div class="detail-block"><h4>Alineación con el reto seleccionado</h4>${renderItems(report.sustainability)}</div>
  `;
}

function buildDetailedImprovementReport(data) {
  const structureMissing = data.structure.missing || [];
  const structurePresent = data.structure.present || [];
  const sustainabilityHits = data.sustainability.keywordHits || [];
  const requiredHits = data.sustainability.requiredHits || [];
  const missingRequired = data.sustainability.missingRequired || [];
  const fillerEvidence = formatFillerDetails(data.fillerDetails);
  const strictEvidence = data.strictNotes && data.strictNotes.length ? data.strictNotes.join(" ") : "No se aplicaron topes estrictos adicionales.";

  return {
    communication: [
      {
        item: "Validación audio vs transcripción",
        score: data.transcriptValidation ? data.transcriptValidation.score : 0,
        interpretation: data.transcriptValidation ? data.transcriptValidation.status : "No disponible",
        evidence: data.transcriptValidation ? data.transcriptValidation.evidence : "No hay datos de audio para comparar.",
        improvement:
          data.transcriptValidation && data.transcriptValidation.warnings && data.transcriptValidation.warnings.length
            ? `Revisa manualmente la transcripción contra el audio. Alertas: ${data.transcriptValidation.warnings.join(" ")}`
            : "La transcripción parece coherente con el audio, pero debe revisarse si se busca máxima precisión en muletillas.",
        exercise: "Reproduce el audio completo una vez y corrige el cuadro de transcripción antes de generar el reporte final."
      },
      {
        item: "Cumplimiento mínimo del reto",
        score: data.strictNotes && data.strictNotes.length ? 60 : 100,
        interpretation: data.strictNotes && data.strictNotes.length ? "Se aplicaron criterios estrictos" : "Cumplió condiciones mínimas",
        evidence: strictEvidence,
        improvement: data.strictNotes && data.strictNotes.length
          ? "Desarrolla la respuesta con más contenido, estructura completa y acción concreta. Una respuesta muy corta no debe obtener calificación alta aunque suene clara."
          : "La respuesta cumple condiciones mínimas de extensión, tiempo y desarrollo.",
        exercise: "Prepara un mensaje con 4 partes: problema, impacto, solución y acción, con mínimo 45 palabras."
      },
      {
        item: "Ritmo",
        score: data.rhythm.score,
        interpretation: data.rhythm.label,
        evidence: data.wordsPerMinute ? `Ritmo calculado: ${data.wordsPerMinute} palabras por minuto. Rango objetivo: 115–160.` : "No se pudo calcular ritmo confiable.",
        improvement: data.rhythm.score >= 85
          ? "Mantén este ritmo y usa pausas breves antes de ideas importantes."
          : "Practica con cronómetro. Si vas rápido, separa frases y respira; si vas lento, reduce silencios largos.",
        exercise: "Repite el mensaje en 45 segundos, marcando pausas después del problema, impacto y antes de la acción final."
      },
      {
        item: "Claridad",
        score: data.clarity.score,
        interpretation: data.clarity.label,
        evidence: `Promedio estimado: ${data.clarity.avgWordsPerSentence} palabras por frase. Palabras totales: ${data.wordCount}.`,
        improvement: data.clarity.score >= 85
          ? "Tu mensaje es claro. Para subirlo de nivel, agrega un ejemplo corto."
          : "Reduce frases largas y evita conceptos abstractos sin ejemplo. Usa una idea principal, un ejemplo y una acción.",
        exercise: "Escribe tu idea en una frase de máximo 15 palabras y agrega un ejemplo práctico."
      },
      {
        item: "Ortografía y presentación",
        score: data.orthography ? data.orthography.score : 0,
        interpretation: data.orthography ? data.orthography.label : "No disponible",
        evidence: data.orthography ? data.orthography.summary : "No disponible.",
        improvement:
          data.orthography && data.orthography.score >= 85
            ? "La presentación escrita es aceptable. Mantén signos de puntuación y frases ordenadas."
            : "Revisa puntuación, mayúsculas, tildes y expresiones informales. No corrijas la transcripción antes de evaluar, pero sí presenta una versión limpia en el reporte.",
        exercise: "Después de transcribir literalmente, crea una versión de lectura con pausas, comas y puntos sin borrar las muletillas de la evidencia."
      },
      {
        item: "Muletillas",
        score: fillerScore(data.fillerCount),
        interpretation: `${data.fillerCount} muletilla(s) detectada(s)`,
        evidence: `Muletillas exactas detectadas: ${fillerEvidence}`,
        improvement: data.fillerCount <= 2
          ? "Buen control de muletillas. Mantén pausas silenciosas."
          : `Trabaja específicamente las muletillas detectadas: ${fillerEvidence}. Reemplázalas por pausas silenciosas.`,
        exercise: "Graba 20 segundos. Cada vez que sientas una muletilla, haz una pausa corta sin decir nada."
      },
      {
        item: "Estructura",
        score: data.structure.score,
        interpretation: data.structure.score >= 75 ? "Estructura sólida" : `Faltó reforzar: ${structureMissing.join(", ") || "algún componente"}`,
        evidence: `Presentes: ${structurePresent.join(", ") || "ninguno"}. Faltantes: ${structureMissing.join(", ") || "ninguno"}.`,
        improvement: data.structure.score >= 75
          ? "La estructura funciona. Mejora el cierre con una invitación concreta."
          : "Organiza tu respuesta en problema, impacto, solución y acción.",
        exercise: "Usa: “El problema es…”, “Esto impacta en…”, “Podemos solucionarlo con…”, “Desde hoy propongo…”."
      },
      {
        item: "Persuasión",
        score: data.persuasion.score,
        interpretation: data.persuasion.label,
        evidence: data.persuasion.hits && data.persuasion.hits.length ? `Señales detectadas: ${data.persuasion.hits.join(", ")}.` : "No se detectaron suficientes señales persuasivas.",
        improvement: data.persuasion.score >= 85
          ? "Tu mensaje tiene fuerza persuasiva. Agrega una consecuencia positiva."
          : "Agrega beneficio, invitación y sentido de equipo. Usa “podemos”, “nos ayuda a”, “beneficia a”.",
        exercise: "Reescribe el cierre iniciando con “Los invito a…” y terminando con un beneficio."
      },
      {
        item: "Concisión",
        score: data.concision.score,
        interpretation: data.concision.label,
        evidence: `Palabras usadas: ${data.wordCount}. Tiempo del reto: ${data.challenge.durationSeconds} segundos.`,
        improvement: data.concision.score >= 85
          ? "La extensión está controlada."
          : "Si fue corto, agrega ejemplo e impacto. Si fue largo, elimina repeticiones y deja una acción final.",
        exercise: "Resume en tres líneas: qué pasa, por qué importa y qué hacemos."
      }
    ],
    sustainability: [
      {
        item: "Comprensión del reto",
        score: data.sustainability.conceptScore,
        interpretation: `${requiredHits.length}/${data.challenge.requiredConcepts.length} conceptos clave incluidos`,
        evidence: `Criterio aplicado: ${getChallengeCriteriaDescription(data.challenge)} Detectados: ${requiredHits.join(", ") || "ninguno"}. Faltantes: ${missingRequired.join(", ") || "ninguno"}.`,
        improvement: data.sustainability.conceptScore >= 80
          ? "Comprendiste bien el tema. Agrega un ejemplo propio de la operación."
          : `Refuerza los conceptos faltantes: ${missingRequired.join(", ") || data.challenge.requiredConcepts.join(", ")}.`,
        exercise: "Define el concepto en una frase y di: “En la empresa esto se ve cuando…”."
      },
      {
        item: "Aplicación al reto",
        score: data.sustainability.businessScore,
        interpretation: data.sustainability.hasBusinessContext ? "Conectado con contexto empresarial" : "Faltó conexión con la empresa",
        evidence: data.sustainability.hasBusinessContext
          ? "Se detectó conexión con empresa, cliente, servicio, calidad, laboratorio, banco de sangre, paciente, SST, trabajo o proceso."
          : "No se detectó una referencia clara al contexto empresarial.",
        improvement: data.sustainability.hasBusinessContext
          ? "Menciona un área, proceso, cliente o situación específica."
          : "Conecta el tema con oficina, atención al cliente, laboratorio, SST, calidad, soporte o procesos internos.",
        exercise: "Agrega: “En nuestro trabajo esto aplica cuando…”."
      },
      {
        item: "Acción concreta",
        score: data.sustainability.actionScore,
        interpretation: data.sustainability.hasAction ? "Incluyó acción concreta" : "Faltó una acción clara",
        evidence: data.sustainability.hasAction ? "Se detectó intención de acción." : "No se detectó una acción concreta.",
        improvement: data.sustainability.hasAction ? "Define responsable o momento: quién y desde cuándo." : "Cierra con una conducta observable.",
        exercise: "Termina con: “Desde hoy vamos a…”."
      },
      {
        item: "Impacto explicado",
        score: data.sustainability.impactScore,
        interpretation: data.sustainability.hasImpact ? "Explicó impacto o beneficio" : "Faltó explicar por qué importa",
        evidence: data.sustainability.hasImpact ? "Se detectó impacto o beneficio." : "No se detectó claramente el impacto o beneficio.",
        improvement: data.sustainability.hasImpact ? "Menciona beneficio ambiental, operativo, de calidad, seguridad o confianza." : "Explica qué mejora: menos residuos, menor huella, más confianza o mejor experiencia.",
        exercise: "Después de tu acción agrega: “Esto es importante porque…”."
      },
      {
        item: "Lenguaje contextual",
        score: Math.min(100, 45 + sustainabilityHits.length * 8),
        interpretation: `${sustainabilityHits.length} palabra(s) clave detectada(s)`,
        evidence: sustainabilityHits.length ? `Palabras clave detectadas: ${sustainabilityHits.join(", ")}.` : "No se detectaron suficientes palabras clave.",
        improvement: sustainabilityHits.length >= 5 ? "Usaste vocabulario adecuado. Conecta cada palabra clave a una idea." : "Incluye vocabulario del reto: calidad, cliente, servicio, confianza, huella, residuos, reciclaje, SST o laboratorio.",
        exercise: "Elige tres palabras clave del reto y construye una frase con cada una."
      }
    ]
  };
}

function updateFillerPreview() {
  const text = transcriptInput.value.trim();

  if (!text) {
    fillerPreviewText.innerHTML = "Escribe la transcripción literal para ver aquí las muletillas detectadas antes de evaluar.";
    return;
  }

  const cleanText = normalizeText(text);
  const details = getFillerDetails(cleanText);
  const count = details.reduce((sum, item) => sum + item.count, 0);

  if (!count) {
    fillerPreviewText.innerHTML = '<span class="filler-ok">No se detectaron muletillas en el texto escrito.</span>';
    return;
  }

  fillerPreviewText.innerHTML = `<span class="filler-warning">${count} posible(s) muletilla(s) / repetición(es) detectada(s):</span> ${escapeHtml(formatFillerDetails(details))}`;
}

function saveResultLocal(result) {
  const normalized = normalizeResultForStorage(result);

  const currentHistory = loadHistory();
  const exists = currentHistory.some((item) => item.validationCode === normalized.validationCode);

  state.history = exists
    ? currentHistory.map((item) => item.validationCode === normalized.validationCode ? normalized : item)
    : [normalized, ...currentHistory];

  state.history = state.history.slice(0, 500);
  persistHistory(state.history);
  renderHistory();

  try {
    sessionStorage.setItem("comunica_last_result", JSON.stringify(normalized));
  } catch {}

  saveStatus.textContent = "Local guardado";
}

function persistHistory(history) {
  const payload = JSON.stringify(history);

  // Current key.
  localStorage.setItem(STORAGE_KEY, payload);

  // Mirror key for dashboard recovery.
  localStorage.setItem("comunica_con_impacto_history_latest", payload);
}

function normalizeResultForStorage(result) {
  return {
    ...result,
    storedAt: new Date().toISOString(),
    reportHtmlSummary: {
      alias: result.alias,
      eventCode: result.eventCode,
      topic: result.topic,
      total: result.total,
      level: result.level,
      validationCode: result.validationCode,
      feedback: result.feedback,
      transcript: result.text,
      detailedReport: result.detailedReport,
      detail: result.detail
    }
  };
}


function loadHistory() {
  const merged = [];
  const seen = new Set();
  const keys = Array.from(new Set([
    ...STORAGE_KEYS_TO_READ,
    "comunica_con_impacto_history_latest"
  ]));

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        const unique = item.validationCode || item.id || `${item.alias}-${item.date}-${item.total}`;
        if (!seen.has(unique)) {
          seen.add(unique);
          merged.push(item);
        }
      }
    } catch {}
  }

  return merged
    .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))
    .slice(0, 500);
}


function renderHistory() {
  if (!state.history.length) {
    historyList.innerHTML = "<p>Aún no hay resultados guardados en este dispositivo.</p>";
    return;
  }

  historyList.innerHTML = state.history.map((item) => {
    const date = new Date(item.date).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
    return `<div class="history-item"><strong>${escapeHtml(item.topic)} — ${item.total}/100</strong><span>${date} · ${escapeHtml(item.level)} · ${escapeHtml(item.alias)} · Verificación: ${escapeHtml(item.validationCode)}</span></div>`;
  }).join("");
}

function lockEvaluatorPanel() {
  evaluatorDataCard.classList.add("hidden");
  evaluatorResponsesCard.classList.add("hidden");
  evaluatorActionsCard.classList.add("hidden");
  evaluatorDeleteCard.classList.add("hidden");
  evaluatorFullReportCard.classList.add("hidden");
  dashboardMetrics.innerHTML = "<li>Contenido protegido. Inicia sesión como evaluador.</li>";
  responsesTable.innerHTML = "<p>Contenido protegido.</p>";
  deleteStudentSelect.innerHTML = '<option value="">Contenido protegido</option>';
  deleteResponseSelect.innerHTML = '<option value="">Contenido protegido</option>';
  deleteResponseStatus.textContent = "";
  if (reportStudentSelect) reportStudentSelect.innerHTML = '<option value="">Contenido protegido</option>';
  if (reportResponseSelect) reportResponseSelect.innerHTML = '<option value="">Contenido protegido</option>';
  if (savedReportViewer) savedReportViewer.innerHTML = "<p>Contenido protegido.</p>";
}

function unlockEvaluatorPanel() {
  evaluatorDataCard.classList.remove("hidden");
  evaluatorResponsesCard.classList.remove("hidden");
  evaluatorActionsCard.classList.remove("hidden");
  evaluatorDeleteCard.classList.remove("hidden");
  evaluatorFullReportCard.classList.remove("hidden");
}

async function loginEvaluator() {
  const user = evaluatorEmail.value.trim();
  const password = evaluatorPassword.value;
  const expectedUser = CONFIG.EVALUATOR_DEMO_USER || "VGU";
  const expectedPassword = CONFIG.EVALUATOR_DEMO_PASSWORD || "8028";

  if (!user || !password) {
    evaluatorLoginStatus.textContent = "Digite usuario y contraseña.";
    return;
  }

  // Modo evento centralizado: VGU / 8028 consulta Supabase si está configurado.
  if (user === expectedUser && password === expectedPassword) {
    evaluatorSession = {
      isLoggedIn: true,
      mode: supabaseClient ? "supabase_public" : "demo"
    };

    evaluatorLoginStatus.textContent = supabaseClient
      ? "Evaluador autenticado. Consultando resultados centralizados en Supabase."
      : "Evaluador autenticado en modo local. Sin Supabase, solo verás resultados de este dispositivo.";

    roleStatus.textContent = "Evaluador";
    unlockEvaluatorPanel();
    await loadEvaluatorDashboard();
    return;
  }

  // Modo opcional avanzado: email/password de Supabase Auth.
  if (supabaseClient && user.includes("@")) {
    try {
      await supabaseClient.auth.signOut();
      const { error } = await supabaseClient.auth.signInWithPassword({ email: user, password });

      if (error) {
        evaluatorLoginStatus.textContent = "No fue posible ingresar con Supabase Auth. Revisa usuario y contraseña.";
        return;
      }

      evaluatorSession = { isLoggedIn: true, mode: "supabase" };
      evaluatorLoginStatus.textContent = "Evaluador autenticado con Supabase Auth.";
      roleStatus.textContent = "Evaluador";
      unlockEvaluatorPanel();
      await loadEvaluatorDashboard();
      return;
    } catch {
      evaluatorLoginStatus.textContent = "Error de autenticación con Supabase Auth.";
      return;
    }
  }

  evaluatorLoginStatus.textContent = "Usuario o contraseña incorrectos.";
}


async function logoutEvaluator() {
  evaluatorSession = { isLoggedIn: false, mode: "none" };
  roleStatus.textContent = "Participante";
  evaluatorLoginStatus.textContent = "Sesión cerrada.";
  lockEvaluatorPanel();

  if (supabaseClient && evaluatorSession.mode === "supabase") {
    await supabaseClient.auth.signOut();
  }
  await ensureStudentSession();
}

async function loadEvaluatorDashboard() {
  if (!evaluatorSession.isLoggedIn) {
    lockEvaluatorPanel();
    evaluatorLoginStatus.textContent = "Debes iniciar sesión para ver resultados.";
    return;
  }

  unlockEvaluatorPanel();
  const code = dashboardEventCode.value.trim() || EVENT_CODE;

  if (!supabaseClient || evaluatorSession.mode === "demo") {
    const rows = state.history
      .filter((item) => item.eventCode === code)
      .map((item) => resultToRow(item));
    state.dashboardRows = rows;
    renderDashboard(rows, code, "local");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("responses")
      .select("*")
      .eq("event_code", code)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      dashboardMetrics.innerHTML = `<li>No se pudo cargar: ${escapeHtml(error.message)}</li>`;
      return;
    }

    state.dashboardRows = data || [];
    renderDashboard(state.dashboardRows, code, "supabase");
  } catch {
    dashboardMetrics.innerHTML = "<li>Error inesperado al cargar dashboard.</li>";
  }
}

function resultToRow(item) {
  return {
    id: item.id,
    created_at: item.date,
    alias: item.alias,
    topic: item.topic,
    total_score: item.total,
    communication_score: item.communicationScore,
    sustainability_score: item.sustainabilityScore,
    validation_code: item.validationCode,
    full_result: item
  };
}

function renderDashboard(rows, code, source) {
  const count = rows.length;
  const avg = (field) => count ? Math.round(rows.reduce((sum, r) => sum + Number(r[field] || 0), 0) / count) : 0;
  const averageTotal = avg("total_score");
  const averageCom = avg("communication_score");
  const averageSus = avg("sustainability_score");

  dashboardMetrics.innerHTML = `
    <li>Fuente: ${source}</li>
    <li>Evento: ${escapeHtml(code)}</li>
    <li>Respuestas: ${count}</li>
    <li>Promedio total: ${averageTotal}/100</li>
    <li>Promedio comunicación: ${averageCom}/100</li>
    <li>Promedio alineación al reto: ${averageSus}/100</li>
  `;

  renderResponsesTable(rows);
  populateDeleteResponseSelect(rows);
  populateReportResponseSelect(rows);
  renderStatsDashboard(rows);
}

function renderResponsesTable(rows) {
  if (!rows.length) {
    responsesTable.innerHTML = "<p>No hay respuestas para este evento.</p>";
    return;
  }

  responsesTable.innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Alias</th><th>Tema</th><th>Total</th><th>Comunicación</th><th>Sostenibilidad</th><th>Verificación</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${new Date(r.created_at).toLocaleString("es-CO")}</td>
            <td>${escapeHtml(r.alias || "Anónimo")}</td>
            <td>${escapeHtml(r.topic || "")}</td>
            <td>${r.total_score || 0}</td>
            <td>${r.communication_score || 0}</td>
            <td>${r.sustainability_score || 0}</td>
            <td>${escapeHtml(r.validation_code || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function populateReportResponseSelect(rows) {
  if (!reportStudentSelect || !reportResponseSelect) return;

  if (!rows || !rows.length) {
    reportStudentSelect.innerHTML = '<option value="">No hay alumnos</option>';
    reportResponseSelect.innerHTML = '<option value="">No hay respuestas</option>';
    savedReportViewer.innerHTML = "<p>No hay informes guardados.</p>";
    return;
  }

  const students = Array.from(new Set(rows.map((row) => row.alias || "Anónimo"))).sort();

  reportStudentSelect.innerHTML = '<option value="">Selecciona un alumno</option>' +
    students.map((alias) => `<option value="${escapeHtml(alias)}">${escapeHtml(alias)}</option>`).join("");

  reportResponseSelect.innerHTML = '<option value="">Selecciona un alumno primero</option>';
  savedReportViewer.innerHTML = "<p>Selecciona un alumno y una respuesta para ver el informe completo.</p>";
}

function filterReportResponsesByStudent() {
  const alias = reportStudentSelect.value;

  if (!alias) {
    reportResponseSelect.innerHTML = '<option value="">Selecciona un alumno primero</option>';
    return;
  }

  const rows = (state.dashboardRows || []).filter((row) => (row.alias || "Anónimo") === alias);

  if (!rows.length) {
    reportResponseSelect.innerHTML = '<option value="">Este alumno no tiene informes</option>';
    return;
  }

  reportResponseSelect.innerHTML = rows.map((row, index) => {
    const key = row.id || row.validation_code || String(index);
    const date = row.created_at ? new Date(row.created_at).toLocaleString("es-CO") : "";
    const label = `${row.topic || "Sin tema"} · ${row.total_score || 0}/100 · ${row.validation_code || "sin código"} · ${date}`;
    return `<option value="${escapeHtml(String(key))}">${escapeHtml(label)}</option>`;
  }).join("");
}

function getSelectedReportRow() {
  const selectedKey = reportResponseSelect.value;
  if (!selectedKey) return null;

  return (state.dashboardRows || []).find((row, index) =>
    String(row.id || row.validation_code || index) === String(selectedKey)
  );
}

function getFullResultFromRow(row) {
  if (!row) return null;
  if (row.full_result) return row.full_result;
  if (row.scores) return row.scores;
  return row;
}

function viewSavedReport() {
  const row = getSelectedReportRow();
  const result = getFullResultFromRow(row);

  if (!result) {
    savedReportViewer.innerHTML = "<p>Selecciona una respuesta guardada.</p>";
    return;
  }

  const transcript = result.text || result.transcript || "";
  const detail = result.detail || result.scores?.detail || {};
  const detailedReport = result.detailedReport || result.scores?.detailedReport;

  savedReportViewer.innerHTML = `
    <h4>${escapeHtml(result.alias || row.alias || "Anónimo")} · ${escapeHtml(result.topic || row.topic || "")}</h4>
    <p><strong>Puntaje:</strong> ${escapeHtml(String(result.total || row.total_score || 0))}/100</p>
    <p><strong>Nivel:</strong> ${escapeHtml(result.level || getLevel(Number(row.total_score || 0)))}</p>
    <p><strong>Verificación:</strong> ${escapeHtml(result.validationCode || row.validation_code || "")}</p>
    <p><strong>Comunicación:</strong> ${escapeHtml(String(result.communicationScore || row.communication_score || 0))}/100</p>
    <p><strong>Alineación al reto:</strong> ${escapeHtml(String(result.sustainabilityScore || row.sustainability_score || 0))}/100</p>

    <h4>Transcripción evaluada</h4>
    <pre>${escapeHtml(transcript || "Sin transcripción guardada.")}</pre>

    <h4>Validación audio vs transcripción</h4>
    <p>${escapeHtml(result.transcriptValidation?.status || "No disponible.")}</p>
    <pre>${escapeHtml(result.transcriptValidation?.evidence || "")}</pre>
    <pre>${escapeHtml((result.transcriptValidation?.warnings || []).join(" ") || "Sin alertas.")}</pre>

    <h4>Muletillas detectadas</h4>
    <p>${escapeHtml(formatFillerDetails(result.fillerDetails || []))}</p>

    <h4>Retroalimentación</h4>
    <p>${escapeHtml(result.feedback || "Sin retroalimentación guardada.")}</p>

    <h4>Ortografía y presentación</h4>
    <p>${escapeHtml(detail.orthography?.summary || "No disponible.")}</p>
    <pre>${escapeHtml(detail.orthography?.readableSuggestion || "")}</pre>

    <h4>Informe detallado</h4>
    <pre>${escapeHtml(JSON.stringify(detailedReport || {}, null, 2))}</pre>
  `;
}

function downloadSavedReportJson() {
  const row = getSelectedReportRow();
  const result = getFullResultFromRow(row);

  if (!result) {
    alert("Selecciona una respuesta guardada.");
    return;
  }

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `informe-${result.validationCode || row.validation_code || Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function populateDeleteResponseSelect(rows) {
  if (!rows || !rows.length) {
    deleteStudentSelect.innerHTML = '<option value="">No hay alumnos</option>';
    deleteResponseSelect.innerHTML = '<option value="">No hay respuestas</option>';
    return;
  }

  const students = Array.from(new Set(rows.map((row) => row.alias || "Anónimo"))).sort();

  deleteStudentSelect.innerHTML = '<option value="">Selecciona un alumno</option>' +
    students.map((alias) => `<option value="${escapeHtml(alias)}">${escapeHtml(alias)}</option>`).join("");

  deleteResponseSelect.innerHTML = '<option value="">Selecciona un alumno primero</option>';
}

function filterDeleteResponsesByStudent() {
  const alias = deleteStudentSelect.value;

  if (!alias) {
    deleteResponseSelect.innerHTML = '<option value="">Selecciona un alumno primero</option>';
    return;
  }

  const rows = (state.dashboardRows || []).filter((row) => (row.alias || "Anónimo") === alias);

  if (!rows.length) {
    deleteResponseSelect.innerHTML = '<option value="">Este alumno no tiene respuestas</option>';
    return;
  }

  deleteResponseSelect.innerHTML = rows.map((row, index) => {
    const key = row.id || row.validation_code || String(index);
    const date = row.created_at ? new Date(row.created_at).toLocaleString("es-CO") : "";
    const label = `${row.topic || "Sin tema"} · ${row.total_score || 0}/100 · ${row.validation_code || "sin código"} · ${date}`;
    return `<option value="${escapeHtml(String(key))}">${escapeHtml(label)}</option>`;
  }).join("");
}

async function deleteSelectedResponse() {
  if (!evaluatorSession.isLoggedIn) {
    deleteResponseStatus.textContent = "Debes iniciar sesión como evaluador.";
    return;
  }

  const selectedKey = deleteResponseSelect.value;

  if (!selectedKey) {
    deleteResponseStatus.textContent = "Selecciona una respuesta para borrar.";
    return;
  }

  const confirmed = confirm("¿Seguro que deseas borrar esta respuesta? Esta acción no se puede deshacer.");
  if (!confirmed) return;

  const selectedRow = (state.dashboardRows || []).find((row, index) =>
    String(row.id || row.validation_code || index) === String(selectedKey)
  );

  if (!selectedRow) {
    deleteResponseStatus.textContent = "No se encontró la respuesta seleccionada.";
    return;
  }

  if (evaluatorSession.mode.startsWith("supabase") && supabaseClient && selectedRow.id) {
    const { error } = await supabaseClient.from("responses").delete().eq("id", selectedRow.id);
    if (error) {
      deleteResponseStatus.textContent = `No se pudo borrar en Supabase: ${error.message}`;
      return;
    }
    deleteResponseStatus.textContent = "Respuesta borrada de Supabase.";
    await loadEvaluatorDashboard();
    return;
  }

  const validation = selectedRow.validation_code;
  state.history = state.history.filter((item) => item.validationCode !== validation);
  persistHistory(state.history);
  renderHistory();
  deleteResponseStatus.textContent = "Respuesta borrada del historial local.";
  await loadEvaluatorDashboard();
}

async function deleteAllStudentResponses() {
  if (!evaluatorSession.isLoggedIn) {
    deleteResponseStatus.textContent = "Debes iniciar sesión como evaluador.";
    return;
  }

  const alias = deleteStudentSelect.value;

  if (!alias) {
    deleteResponseStatus.textContent = "Selecciona un alumno.";
    return;
  }

  const confirmed = confirm(`¿Seguro que deseas borrar TODAS las respuestas de "${alias}"?`);
  if (!confirmed) return;

  if (evaluatorSession.mode.startsWith("supabase") && supabaseClient) {
    const { error } = await supabaseClient
      .from("responses")
      .delete()
      .eq("event_code", dashboardEventCode.value.trim() || EVENT_CODE)
      .eq("alias", alias);

    if (error) {
      deleteResponseStatus.textContent = `No se pudo borrar en Supabase: ${error.message}`;
      return;
    }

    deleteResponseStatus.textContent = `Respuestas de "${alias}" borradas de Supabase.`;
    await loadEvaluatorDashboard();
    return;
  }

  state.history = state.history.filter((item) => item.alias !== alias);
  persistHistory(state.history);
  renderHistory();
  deleteResponseStatus.textContent = `Respuestas de "${alias}" borradas del historial local.`;
  await loadEvaluatorDashboard();
}

function openStatsDashboard() {
  if (!evaluatorSession.isLoggedIn) {
    lockEvaluatorPanel();
    evaluatorLoginStatus.textContent = "Debes iniciar sesión para abrir el dashboard.";
    return;
  }

  evaluatorPanel.classList.add("hidden");
  statsDashboardPanel.classList.remove("hidden");
  renderStatsDashboard(state.dashboardRows || []);
}

function closeStatsDashboard() {
  statsDashboardPanel.classList.add("hidden");
  evaluatorPanel.classList.remove("hidden");
}

function renderStatsDashboard(rows) {
  const count = rows.length;
  const avg = (field) => count ? Math.round(rows.reduce((sum, r) => sum + Number(r[field] || 0), 0) / count) : 0;
  const averageTotal = avg("total_score");
  const averageCom = avg("communication_score");
  const averageSus = avg("sustainability_score");

  dashTotalResponses.textContent = String(count);
  dashAverageTotal.textContent = `${averageTotal}/100`;
  dashAverageCommunication.textContent = `${averageCom}/100`;
  dashAverageSustainability.textContent = `${averageSus}/100`;

  dimensionBars.innerHTML = [
    ["Total", averageTotal],
    ["Comunicación", averageCom],
    ["Alineación al reto", averageSus]
  ].map(([label, value]) => renderStatBar(label, value)).join("");

  const levels = {};
  rows.forEach((row) => {
    const level = getLevel(Number(row.total_score || 0));
    levels[level] = (levels[level] || 0) + 1;
  });

  levelDistribution.innerHTML = Object.keys(levels).length
    ? Object.entries(levels).map(([level, qty]) => renderStatBar(level, count ? Math.round((qty / count) * 100) : 0, `${qty} respuesta(s)`)).join("")
    : "<p>No hay datos suficientes.</p>";

  const byChallenge = {};
  rows.forEach((row) => {
    const topic = row.topic || "Sin tema";
    if (!byChallenge[topic]) byChallenge[topic] = { total: 0, count: 0 };
    byChallenge[topic].total += Number(row.total_score || 0);
    byChallenge[topic].count += 1;
  });

  challengeAverages.innerHTML = Object.keys(byChallenge).length
    ? Object.entries(byChallenge).map(([topic, item]) => renderStatBar(topic, Math.round(item.total / item.count), `${item.count} respuesta(s)`)).join("")
    : "<p>No hay datos por reto.</p>";

  dashboardExecutiveSummary.textContent = buildDashboardExecutiveSummary({ count, averageTotal, averageCom, averageSus });
}

function renderStatBar(label, value, note = "") {
  const safeValue = clamp(Number(value) || 0, 0, 100);
  return `
    <div class="stat-row">
      <div class="stat-label"><span>${escapeHtml(label)}</span><span>${safeValue}/100</span></div>
      <div class="stat-bar"><div class="stat-fill" style="width: ${safeValue}%"></div></div>
      ${note ? `<div class="stat-note">${escapeHtml(note)}</div>` : ""}
    </div>
  `;
}

function buildDashboardExecutiveSummary(stats) {
  if (!stats.count) return "Aún no hay respuestas suficientes para generar lectura ejecutiva.";
  const gap = stats.averageCom - stats.averageSus;
  if (stats.averageTotal >= 80) return "El grupo muestra desempeño alto. La siguiente intervención puede enfocarse en mensajes más persuasivos y cierres con compromiso medible.";
  if (stats.averageTotal < 60) return "El grupo requiere refuerzo. Conviene practicar mensajes con estructura obligatoria: problema, impacto, solución y acción.";
  if (gap >= 10) return "La comunicación está mejor que el contenido técnico/contextual. Refuerza conceptos y aplicación empresarial.";
  if (gap <= -10) return "El contenido técnico/contextual está mejor que la comunicación. Refuerza claridad, ritmo, estructura y persuasión.";
  return "El grupo tiene desempeño medio y balanceado. La mejora principal es responder con más desarrollo, acciones concretas y evidencias claras.";
}

async function saveResultRemote(result) {
  if (!supabaseClient) {
    saveStatus.textContent = "Local";
    return;
  }

  try {
    const payload = {
      event_code: result.eventCode,
      alias: result.alias,
      challenge_id: result.challengeId,
      challenge_title: result.challengeTitle,
      topic: result.topic,
      transcript: result.text,
      total_score: result.total,
      communication_score: result.communicationScore,
      sustainability_score: result.sustainabilityScore,
      validation_code: result.validationCode,
      scores: result
    };

    const { error } = await supabaseClient.from("responses").insert(payload);

    if (error) {
      console.error("Supabase insert error", error);
      saveStatus.textContent = `Local / error Supabase: ${error.message}`;
      return;
    }

    saveStatus.textContent = "Supabase central";
  } catch (error) {
    console.error("Unexpected remote save error", error);
    saveStatus.textContent = "Local / error remoto";
  }
}


function initSupabase() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY || !window.supabase) {
    storageStatus.textContent = "Modo local";
    return;
  }

  supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  storageStatus.textContent = "Supabase central configurado";
}

async function ensureStudentSession() {
  if (!supabaseClient) return;

  // v3.19: modo evento centralizado.
  // No requiere login de alumno. El anon key inserta en Supabase usando políticas RLS públicas del evento.
  storageStatus.textContent = "Supabase central activo";
}


function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?¿¡()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWords(text) {
  if (!text) return [];
  return text.split(" ").filter(Boolean);
}

function countFillers(text) {
  return getFillerDetails(text).reduce((sum, item) => sum + item.count, 0);
}

function getFillerDetails(text) {
  const detailsMap = new Map();
  const normalizedText = normalizeText(text);

  fillerPatternDefinitions.forEach((definition) => {
    const regex = new RegExp(definition.regex, "gi");
    const matches = normalizedText.match(regex);

    if (matches && matches.length > 0) {
      const existing = detailsMap.get(definition.label) || {
        word: definition.label,
        normalizedWord: definition.label,
        count: 0,
        examples: []
      };

      existing.count += matches.length;
      existing.examples.push(...matches.slice(0, 8));
      detailsMap.set(definition.label, existing);
    }
  });

  detectImmediateRepetitions(normalizedText).forEach((item) => {
    const label = `repetición inmediata: "${item.word}"`;
    const existing = detailsMap.get(label) || {
      word: label,
      normalizedWord: label,
      count: 0,
      examples: []
    };

    existing.count += item.count;
    existing.examples.push(item.example);
    detailsMap.set(label, existing);
  });

  return Array.from(detailsMap.values())
    .map((item) => ({ ...item, examples: Array.from(new Set(item.examples)).slice(0, 8) }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function detectImmediateRepetitions(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const results = [];

  for (let i = 1; i < words.length; i++) {
    const previous = words[i - 1];
    const current = words[i];

    if (previous === current && previous.length > 1 && !["si", "no"].includes(previous)) {
      results.push({ word: previous, count: 1, example: `${previous} ${current}` });
    }
  }

  return results;
}

function formatFillerDetails(details) {
  if (!details || !details.length) {
    return "No se detectaron muletillas específicas en la transcripción.";
  }

  return details.map((item) => {
    const examples = item.examples && item.examples.length ? ` — ejemplos: ${item.examples.join(" / ")}` : "";
    return `"${item.word}" (${item.count} ${item.count === 1 ? "vez" : "veces"})${examples}`;
  }).join(", ");
}

function fillerScore(count) {
  if (count === 0) return 100;
  if (count <= 2) return 85;
  if (count <= 4) return 70;
  if (count <= 7) return 55;
  return 35;
}

function evaluateRhythm(wordsPerMinute) {
  if (!wordsPerMinute) return { score: 60, label: "Sin duración suficiente", message: "No se pudo estimar bien el ritmo." };
  if (wordsPerMinute >= 115 && wordsPerMinute <= 160) return { score: 100, label: "Ritmo adecuado", message: "Tu ritmo permite comprender el mensaje con comodidad." };
  if (wordsPerMinute > 160 && wordsPerMinute <= 185) return { score: 78, label: "Un poco rápido", message: "Podrías hacer más pausas para dar fuerza a tus ideas." };
  if (wordsPerMinute < 115 && wordsPerMinute >= 85) return { score: 78, label: "Un poco lento", message: "Puedes subir levemente la energía para mantener atención." };
  return { score: 55, label: "Ritmo por ajustar", message: "El ritmo se aleja del rango recomendado. Practica con pausas y frases más cortas." };
}

function evaluateClarity(text, wordCount) {
  const estimatedSentences = Math.max(1, Math.ceil(wordCount / 22));
  const avgWordsPerSentence = wordCount / estimatedSentences;
  let score = 100;

  if (avgWordsPerSentence > 26) score -= 25;
  if (avgWordsPerSentence > 35) score -= 20;
  if (wordCount < 18) score -= 20;

  score = clamp(score, 35, 100);

  return {
    score,
    label: score >= 85 ? "Mensaje claro" : score >= 70 ? "Claridad aceptable" : "Claridad por mejorar",
    avgWordsPerSentence: Math.round(avgWordsPerSentence)
  };
}

function evaluateStructure(text) {
  const result = {};
  const labels = { problem: "problema", impact: "impacto", solution: "solución", action: "acción concreta" };

  Object.keys(structurePatterns).forEach((key) => {
    const matches = structurePatterns[key].filter((pattern) => text.includes(normalizeText(pattern)));
    result[key] = matches.length > 0;
    result[`${key}Matches`] = matches;
  });

  const present = Object.keys(labels).filter((key) => result[key]).map((key) => labels[key]);
  const missing = Object.keys(labels).filter((key) => !result[key]).map((key) => labels[key]);

  return { score: Math.round((present.length / 4) * 100), achieved: present.length, present, missing, ...result };
}

function evaluateSustainability(text, challenge) {
  const keywordHits = sustainabilityKeywords.filter((keyword) => text.includes(normalizeText(keyword)));
  const requiredHits = challenge.requiredConcepts.filter((concept) => text.includes(normalizeText(concept)));
  const missingRequired = challenge.requiredConcepts.filter((concept) => !requiredHits.includes(concept));

  const hasBusinessContext =
    text.includes("empresa") || text.includes("equipo") || text.includes("area") ||
    text.includes("proceso") || text.includes("oficina") || text.includes("trabajo") ||
    text.includes("operacion") || text.includes("cliente") || text.includes("servicio") ||
    text.includes("calidad") || text.includes("laboratorio") || text.includes("banco de sangre") ||
    text.includes("paciente") || text.includes("sst");

  const hasAction =
    text.includes("propongo") || text.includes("podemos") || text.includes("debemos") ||
    text.includes("implementar") || text.includes("reducir") || text.includes("cambiar") ||
    text.includes("separar") || text.includes("reciclar") || text.includes("apagar") ||
    text.includes("reutilizar") || text.includes("acompanar") || text.includes("mejorar") ||
    text.includes("responder") || text.includes("escuchar") || text.includes("orientar") ||
    text.includes("invito");

  const hasImpact =
    text.includes("impacto") || text.includes("beneficio") || text.includes("ahorro") ||
    text.includes("costo") || text.includes("contaminacion") || text.includes("emisiones") ||
    text.includes("residuos") || text.includes("confianza") || text.includes("seguridad") ||
    text.includes("satisfaccion") || text.includes("paciente") || text.includes("medico");

  const conceptScore = clamp(
    Math.round((requiredHits.length / challenge.requiredConcepts.length) * 70) + Math.min(keywordHits.length * 6, 30),
    20,
    100
  );

  return {
    keywordHits,
    requiredHits,
    missingRequired,
    businessScore: hasBusinessContext ? 100 : 55,
    actionScore: hasAction ? 100 : 50,
    impactScore: hasImpact ? 100 : 55,
    conceptScore,
    hasBusinessContext,
    hasAction,
    hasImpact
  };
}


function evaluateOrthography(rawText) {
  const original = String(rawText || "").trim();
  const issues = [];

  if (!original) {
    return {
      score: 0,
      label: "No evaluable",
      issues: ["No hubo texto para revisar."],
      summary: "No es posible hacer revisión ortográfica sin transcripción.",
      readableSuggestion: "No disponible."
    };
  }

  const sentenceMarks = (original.match(/[.!?¿¡]/g) || []).length;
  const words = original.split(/\s+/).filter(Boolean);
  const longFragments = original.split(/[.!?]+/).some((part) => part.trim().split(/\s+/).filter(Boolean).length > 35);

  if (sentenceMarks === 0 && words.length > 25) {
    issues.push("Faltan signos de puntuación para separar ideas.");
  }

  if (longFragments) {
    issues.push("Hay fragmentos muy largos; conviene dividir con puntos o comas.");
  }

  if (/\s{2,}/.test(original)) {
    issues.push("Hay espacios repetidos.");
  }

  if (/[a-záéíóúñ]\s+[A-ZÁÉÍÓÚÑ]/.test(original)) {
    issues.push("Hay mayúsculas intermedias que parecen venir de la transcripción automática.");
  }

  if (/\b(okay|ok)\b/i.test(original)) {
    issues.push("Hay expresiones informales o anglicismos; si son literales, consérvalos como evidencia y corrígelos solo en la versión de lectura.");
  }

  const withoutAccents = removeAccents(original);
  if (/[áéíóúÁÉÍÓÚ]/.test(original) === false && /\b(esta|este|si|accion|evaluacion|transcripcion|carbono|atencion)\b/i.test(withoutAccents)) {
    issues.push("Revisar tildes: la transcripción automática suele omitirlas.");
  }

  const score = clamp(100 - issues.length * 14, 45, 100);
  const label = score >= 85 ? "Presentación escrita adecuada" : score >= 70 ? "Presentación aceptable con ajustes" : "Presentación por corregir";

  return {
    score,
    label,
    issues,
    summary: issues.length
      ? `Observaciones: ${issues.join(" ")}`
      : "No se detectaron problemas evidentes de presentación en la transcripción.",
    readableSuggestion: createReadableSuggestion(original)
  };
}

function createReadableSuggestion(text) {
  let cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  cleaned = cleaned
    .replace(/\bokay\b/gi, "ok")
    .replace(/\bAh\b/g, "Ah,")
    .replace(/\bEntonces\b/g, "Entonces,")
    .replace(/\bBueno\b/g, "Bueno,");

  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  if (!/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }

  return `Versión sugerida para lectura, sin reemplazar la transcripción literal evaluada: ${cleaned}`;
}

function removeAccents(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getChallengeCriteriaDescription(challenge) {
  const id = challenge?.id || "";

  if (id.includes("huella")) {
    return "Reto Huella de carbono: se califica si explica huella/emisiones, conecta con empresa, propone reducción concreta y menciona impacto ambiental u operativo.";
  }

  if (id.includes("reciclaje")) {
    return "Reto Reciclaje: se califica si habla de residuos, separación, reciclaje, cultura empresarial, acción concreta e impacto.";
  }

  if (id.includes("atencion")) {
    return "Reto Atención al cliente: se califica si conecta servicio, calidad, confianza, soporte, SST, cliente/paciente y una acción concreta de mejora.";
  }

  return "Se califica la alineación con los conceptos obligatorios del reto seleccionado, la aplicación empresarial, la acción concreta y el impacto explicado.";
}

function evaluateConcision(wordCount, suggestedSeconds) {
  const expectedMax = Math.round((suggestedSeconds / 60) * 165);
  const expectedMin = Math.round((suggestedSeconds / 60) * 70);

  if (wordCount >= expectedMin && wordCount <= expectedMax) return { score: 100, label: "Extensión adecuada" };
  if (wordCount < expectedMin) return { score: 70, label: "Mensaje muy corto" };
  return { score: 70, label: "Mensaje extenso" };
}

function evaluatePersuasion(text) {
  const persuasiveSignals = ["invito", "beneficio", "podemos", "lograr", "mejorar", "compromiso", "desde hoy", "equipo", "juntos", "responsabilidad"];
  const hits = persuasiveSignals.filter((signal) => text.includes(signal));
  const score = clamp(45 + hits.length * 12, 45, 100);
  return { score, hits, label: score >= 85 ? "Mensaje persuasivo" : score >= 70 ? "Persuasión aceptable" : "Persuasión por fortalecer" };
}


function validateTranscriptAgainstAudio(data) {
  const metrics = data.audioMetrics;

  if (!metrics) {
    return {
      status: "Sin audio",
      score: 0,
      evidence: "No hay audio grabado asociado a este resultado.",
      warnings: ["No se pudo comparar audio contra transcripción."]
    };
  }

  const duration = metrics.durationSeconds || data.durationSeconds || 0;
  const active = metrics.activeSeconds || 0;
  const silence = metrics.silenceSeconds || 0;
  const activeRatio = metrics.activeRatio || 0;
  const wordsPerActiveMinute = active > 0
    ? Math.round((data.wordCount / active) * 60)
    : 0;

  const warnings = [];

  if (data.wordCount < 8 && active > 12) {
    warnings.push("Hay audio útil, pero muy pocas palabras transcritas. La transcripción probablemente está incompleta.");
  }

  if (active > 20 && data.wordCount < 25) {
    warnings.push("La cantidad de palabras es baja frente al audio útil detectado.");
  }

  if (wordsPerActiveMinute < 70 && active > 12) {
    warnings.push("El ritmo por audio útil es muy bajo; puede haber silencios largos o transcripción incompleta.");
  }

  if (wordsPerActiveMinute > 190) {
    warnings.push("El ritmo por audio útil es demasiado alto; puede haber duplicación o exceso de texto frente al audio.");
  }

  if (silence / Math.max(duration, 1) > 0.40) {
    warnings.push("Más del 40% del audio parece silencio o pausa; esto afecta fluidez y puede explicar baja transcripción.");
  }

  if (data.fillerCount === 0 && data.text.length > 80) {
    warnings.push("No se detectaron muletillas; si en el audio sí existen, el navegador pudo haberlas limpiado.");
  }

  const score = clamp(100 - warnings.length * 18, 35, 100);
  const status = warnings.length
    ? "Transcripción plausible, pero requiere revisión manual"
    : "Transcripción coherente con el audio disponible";

  const evidence =
    `Duración de audio: ${duration.toFixed(1)} s. ` +
    `Audio útil estimado: ${active.toFixed(1)} s. ` +
    `Pausas/silencios estimados: ${silence.toFixed(1)} s. ` +
    `Palabras transcritas: ${data.wordCount}. ` +
    `Ritmo por duración total: ${data.wordsPerMinute} ppm. ` +
    `Ritmo por audio útil: ${wordsPerActiveMinute} ppm. ` +
    `Volumen promedio: ${Number(metrics.rmsDb || -99).toFixed(1)} dBFS.`;

  return { status, score, evidence, warnings, wordsPerActiveMinute };
}

function applyStrictScoring(data) {
  const notes = [];
  let communicationScore = data.communicationScore;
  let sustainabilityScore = data.sustainabilityScore;
  let total = data.total;
  let cap = 100;

  if (data.durationSeconds < MIN_RECORDING_SECONDS) {
    cap = Math.min(cap, 55);
    notes.push(`La grabación quedó por debajo del mínimo de ${MIN_RECORDING_SECONDS} segundos.`);
  }

  if (data.durationSeconds > MAX_RECORDING_SECONDS) {
    cap = Math.min(cap, 70);
    notes.push(`La grabación superó el máximo de ${MAX_RECORDING_SECONDS} segundos.`);
  }

  if (data.wordCount < 30) {
    cap = Math.min(cap, 52);
    notes.push("La respuesta fue demasiado corta: menos de 30 palabras no permite desarrollar bien una idea.");
  } else if (data.wordCount < 45) {
    cap = Math.min(cap, 65);
    notes.push("La respuesta fue corta: se recomienda desarrollar al menos 45 palabras para explicar, justificar y cerrar.");
  }

  if (data.structure.score < 50) {
    cap = Math.min(cap, 68);
    notes.push("La estructura fue insuficiente: faltaron al menos dos elementos entre problema, impacto, solución y acción.");
  }

  if (!data.sustainability.hasAction) {
    cap = Math.min(cap, 72);
    notes.push("No se detectó una acción concreta, por eso el puntaje máximo queda limitado.");
  }

  if (!data.sustainability.requiredHits || data.sustainability.requiredHits.length === 0) {
    cap = Math.min(cap, 58);
    notes.push("No se detectaron conceptos obligatorios del reto seleccionado.");
  }

  if (data.fillerCount >= 6) {
    cap = Math.min(cap, 78);
    notes.push("Se detectó uso alto de muletillas.");
  }

  if (total > cap) {
    total = cap;
    communicationScore = Math.min(communicationScore, cap);
    sustainabilityScore = Math.min(sustainabilityScore, cap);
  }

  return { communicationScore: Math.round(communicationScore), sustainabilityScore: Math.round(sustainabilityScore), total: Math.round(total), notes };
}

function getLevel(total) {
  if (total >= 90) return "Orador Regenerativo";
  if (total >= 80) return "Líder de Impacto";
  if (total >= 70) return "Embajador EcoSpeak";
  if (total >= 60) return "Voz Consciente";
  return "Semilla Verde";
}

function getLevelDefinitions() {
  return [
    { name: "Semilla Verde", range: "0–59", description: "Nivel inicial o bajo. La respuesta necesita más desarrollo, estructura, claridad, evidencia o conexión con el reto." },
    { name: "Voz Consciente", range: "60–69", description: "Nivel básico o medio-bajo. La idea se entiende parcialmente, pero faltan impacto, acción concreta, ejemplo o control del discurso." },
    { name: "Embajador EcoSpeak", range: "70–79", description: "Nivel medio funcional. La persona comunica una idea entendible y con intención, pero puede mejorar persuasión, evidencia, estructura y precisión." },
    { name: "Líder de Impacto", range: "80–89", description: "Nivel bueno. El mensaje es claro, estructurado y orientado a la acción. Puede inspirar con ajustes menores." },
    { name: "Orador Regenerativo", range: "90–100", description: "Nivel excelente. La persona comunica con claridad, propósito, estructura, impacto y una acción concreta convincente." }
  ];
}

function getBadges(data) {
  const badges = [];
  if (data.clarity.score >= 85) badges.push("Cero Rodeos");
  if (data.fillerCount <= 1) badges.push("Sin Muletillas");
  if (data.structure.action) badges.push("Pitch con Acción");
  if (data.sustainability.conceptScore >= 80) badges.push("Traductor de Conceptos");
  if (data.sustainability.hasAction) badges.push("Impacto Real");
  if (data.persuasion.score >= 85) badges.push("Voz que Inspira");
  if (data.total >= 80) badges.push("Líder de Impacto");
  if (!badges.length) badges.push("Primer Paso");
  return badges;
}

function buildFeedback(data) {
  const tips = [];

  tips.push(`Tu respuesta tuvo ${data.wordCount} palabras y un ritmo aproximado de ${data.wordsPerMinute} palabras por minuto.`);
  tips.push(data.rhythm.message);

  if (data.fillerCount > 3) {
    tips.push("Detecté varias muletillas. Practica pausas silenciosas en lugar de rellenar con sonidos o palabras de apoyo.");
  } else {
    tips.push("El uso de muletillas fue bajo o controlado.");
  }

  if (data.structure.score < 75) {
    tips.push("Para fortalecer la estructura, usa problema, impacto, solución y acción.");
  } else {
    tips.push("Tu mensaje tuvo una estructura sólida.");
  }

  if (data.sustainability.conceptScore < 70) {
    tips.push(`Refuerza el concepto de ${data.challenge.topic}. Incluye definición simple, ejemplo empresarial y acción concreta.`);
  } else {
    tips.push(`Explicaste el tema de ${data.challenge.topic} con conexión empresarial.`);
  }

  if (data.transcriptValidation && data.transcriptValidation.warnings && data.transcriptValidation.warnings.length) {
    tips.push(`Validación audio vs transcripción: ${data.transcriptValidation.warnings.join(" ")}`);
  }

  if (data.strictNotes && data.strictNotes.length) {
    tips.push(`Criterios estrictos aplicados: ${data.strictNotes.join(" ")}`);
  }

  return tips.join(" ");
}

async function createValidationCode(resultBase) {
  const text = JSON.stringify({ eventCode: resultBase.eventCode, alias: resultBase.alias, date: resultBase.date, topic: resultBase.topic, total: resultBase.total, text: resultBase.text });

  if (!crypto.subtle) return `COM-${Date.now().toString().slice(-8)}`;

  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const hash = Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `COM-${hash.slice(0, 10).toUpperCase()}`;
}

function getDurationSeconds() {
  if (!state.startedAt || !state.endedAt) return 45;
  const elapsed = Math.round((state.endedAt - state.startedAt) / 1000);
  return clamp(elapsed, MIN_RECORDING_SECONDS, MAX_RECORDING_SECONDS);
}

function formatSeconds(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getSpeechSupportMessage() {
  if (!isSecureMicContext()) return "En celulares el micrófono exige HTTPS. Publica la app y usa QR con URL segura.";
  return "La app intentará transcripción automática preliminar. Revísala contra el audio antes de evaluar.";
}

function translateMicAccessError(error) {
  if (!error) return "No se pudo acceder al micrófono.";
  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") return "Permiso de micrófono bloqueado.";
  if (error.name === "NotFoundError") return "El navegador no detecta micrófono.";
  if (error.name === "NotReadableError") return "El micrófono está ocupado por otra app.";
  if (error.name === "SecurityError") return "El navegador bloqueó el micrófono por seguridad. Usa HTTPS.";
  return `Error de micrófono: ${error.name || "desconocido"}. ${error.message || ""}`;
}

function isSecureMicContext() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function drawQr(url) {
  const ctx = qrCanvas.getContext("2d");
  const size = qrCanvas.width;
  const cells = 29;
  const cell = Math.floor(size / cells);
  const padding = Math.floor((size - cell * cells) / 2);
  const seed = hashString(url);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  function bit(x, y) {
    const n = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n) > 0.56;
  }

  function finder(x, y) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(padding + x * cell, padding + y * cell, cell * 7, cell * 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(padding + (x + 1) * cell, padding + (y + 1) * cell, cell * 5, cell * 5);
    ctx.fillStyle = "#000000";
    ctx.fillRect(padding + (x + 2) * cell, padding + (y + 2) * cell, cell * 3, cell * 3);
  }

  finder(1, 1);
  finder(cells - 8, 1);
  finder(1, cells - 8);

  ctx.fillStyle = "#000000";
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const inFinder =
        (x >= 1 && x < 8 && y >= 1 && y < 8) ||
        (x >= cells - 8 && x < cells - 1 && y >= 1 && y < 8) ||
        (x >= 1 && x < 8 && y >= cells - 8 && y < cells - 1);
      if (!inFinder && bit(x, y)) ctx.fillRect(padding + x * cell, padding + y * cell, cell, cell);
    }
  }
}

function downloadJsonReport() {
  if (!state.latestResult) {
    alert("Aún no hay resultado para descargar.");
    return;
  }

  const blob = new Blob([JSON.stringify(state.latestResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comunica-reporte-${state.latestResult.validationCode}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadPdfReport() {
  if (!state.latestResult) {
    alert("Aún no hay resultado para descargar.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("No se pudo cargar el generador PDF. Se abrirá impresión del navegador.");
    window.print();
    return;
  }

  const result = state.latestResult;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const maxWidth = 210 - margin * 2;
  let y = 20;

  const addPageIfNeeded = (extra = 20) => {
    if (y + extra > 280) {
      doc.addPage();
      y = 20;
    }
  };

  const paragraph = (text) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(String(text), maxWidth);
    addPageIfNeeded(lines.length * 5 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  };

  const heading = (text) => {
    addPageIfNeeded(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(text, margin, y);
    y += 7;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Comunica con impacto: Reporte de evaluación", margin, y);
  y += 10;

  paragraph(`Participante: ${result.alias}`);
  paragraph(`Evento: ${result.eventCode}`);
  paragraph(`Puntaje total: ${result.total}/100`);
  paragraph(`Nivel: ${result.level}`);
  paragraph(`Código de verificación: ${result.validationCode}`);

  heading("Transcripción evaluada");
  paragraph(result.text);

  heading("Criterio del reto seleccionado");
  paragraph(getChallengeCriteriaDescription({
    id: result.challengeId,
    topic: result.topic,
    requiredConcepts: challenges.find((item) => item.id === result.challengeId)?.requiredConcepts || []
  }));

  heading("Retroalimentación");
  paragraph(result.feedback);

  heading("Validación audio vs transcripción");
  paragraph(result.transcriptValidation?.status || "No disponible.");
  paragraph(result.transcriptValidation?.evidence || "No hay datos de audio para comparar.");
  paragraph((result.transcriptValidation?.warnings || []).join(" ") || "Sin alertas adicionales.");

  heading("Revisión ortográfica y presentación");
  paragraph(result.detail?.orthography?.summary || "No disponible.");
  paragraph(result.detail?.orthography?.readableSuggestion || "");

  heading("Muletillas detectadas");
  paragraph(formatFillerDetails(result.fillerDetails || []));

  heading("Referencias");
  paragraph("American Psychological Association. (2020). Publication manual of the American Psychological Association (7th ed.). American Psychological Association.");
  paragraph("United Nations. (2015). Transforming our world: The 2030 agenda for sustainable development. United Nations.");

  doc.save(`Comunica-Reporte-${result.validationCode}.pdf`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
