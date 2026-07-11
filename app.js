const STORAGE_KEY = "progetto-adhd-quest-v2";
const LEGACY_STORAGE_KEYS = ["progetto-adhd-quest-v1"];
const XP_PER_LEVEL = 180;
const COACH_ENDPOINT = "/api/coach";
const COACH_HISTORY_LIMIT = 12;
const COACH_TIMEOUT_MS = 12000;
const CLOUD_SYNC_DELAY_MS = 900;
const CLOUD_LOCAL_UPDATED_KEY = `${STORAGE_KEY}-cloud-updated-at`;
const DAILY_QUEST_TARGET = 3;
const BOSS_REWARD_XP = 90;
const BOSS_REWARD_COINS = 5;
const COMBO_WINDOW_MS = 25 * 60 * 1000;
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_TOKEN_KEY = `${STORAGE_KEY}-google-calendar-token`;
const GOOGLE_CALENDAR_LOOKAHEAD_DAYS = 90;
const CALENDAR_SYNC_INTERVAL_MS = 5 * 60 * 1000;

if (typeof window.ADHD_FIREBASE_CONFIG === "undefined") {
  window.ADHD_FIREBASE_CONFIG = null;
}

const rewards = [
  { id: "focus-map", level: 2, name: "Bussola Focus", meta: "priorità visibili" },
  { id: "no-gate", level: 3, name: "Porta del No", meta: "+25 XP a rifiuto" },
  { id: "amber-skin", level: 4, name: "Skin Ambra", meta: "tema sbloccato", theme: "amber" },
  { id: "pink-skin", level: 5, name: "Skin Magenta", meta: "tema sbloccato", theme: "pink" },
  { id: "overload-shield", level: 6, name: "Scudo Sovraccarico", meta: "carico sotto controllo" },
  { id: "deep-sprint", level: 7, name: "Sprint Profondo", meta: "45 minuti" },
];

const noScripts = {
  capacity:
    "Grazie per aver pensato a me. In questo momento ho già la capienza piena e non riuscirei a prenderlo in carico bene, quindi devo dirti di no.",
  priority:
    "Mi interessa, ma ho già preso priorità che non posso spostare. Per non promettere male, questa volta passo.",
  energy:
    "Questa settimana ho poca energia disponibile e sto proteggendo gli impegni essenziali. Preferisco dirti di no adesso invece di sparire dopo.",
  time:
    "I tempi sono troppo stretti per farlo con attenzione. Non posso aggiungerlo adesso, ma grazie per avermelo chiesto.",
};

const defaultState = () => ({
  profile: {
    name: "",
    avatar: "",
    xp: 0,
    coins: 0,
    streak: 0,
    comboCount: 0,
    bestCombo: 0,
    lastComboAt: null,
    lastDoneDay: null,
    theme: "default",
  },
  prefs: {
    energyToday: 2,
    capacityHours: 4,
    focusMinutes: 10,
    filter: "open",
    search: "",
    view: "today",
  },
  wellness: {
    hydration: {
      day: todayKey(),
      ml: 0,
      goalMl: 2000,
      lastDrinkAt: null,
      streak: 0,
      lastGoalDay: null,
    },
  },
  tasks: [],
  history: [],
  meta: {
    localUpdatedAt: 0,
  },
  timer: {
    running: false,
    remaining: 10 * 60,
    taskId: null,
  },
});

let state = loadState();
let selectedCoachTaskId = null;
let coachAiReady = null;
let cloudRef = null;
let cloudUnsubscribe = null;
let cloudApplying = false;
let cloudSaveHandle = null;
let cloudLastSavedAt = 0;
let firebaseAuth = null;
let firebaseDb = null;
let googleProvider = null;
let googleCalendarAccessToken = null;
let calendarSyncHandle = null;
let timerHandle = null;
let toastHandle = null;
let stars = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  profileName: $("#profileName"),
  avatarButton: $("#avatarButton"),
  avatarInput: $("#avatarInput"),
  avatarImage: $("#avatarImage"),
  avatarInitial: $("#avatarInitial"),
  globalSearch: $("#globalSearch"),
  levelLabel: $("#levelLabel"),
  xpFill: $("#xpFill"),
  xpLabel: $("#xpLabel"),
  coinCount: $("#coinCount"),
  streakLabel: $("#streakLabel"),
  missionState: $("#missionState"),
  whyList: $("#whyList"),
  priorityScore: $("#priorityScore"),
  timerClock: $("#timerClock"),
  timerProgressFill: $("#timerProgressFill"),
  timerTask: $("#timerTask"),
  startFocus: $("#startFocus"),
  pauseFocus: $("#pauseFocus"),
  resetFocus: $("#resetFocus"),
  completePrimary: $("#completePrimary"),
  parkPrimary: $("#parkPrimary"),
  missPrimary: $("#missPrimary"),
  splitPrimary: $("#splitPrimary"),
  coachPrimary: $("#coachPrimary"),
  focusModeButton: $("#focusModeButton"),
  exitFocusMode: $("#exitFocusMode"),
  taskForm: $("#taskForm"),
  taskTitle: $("#taskTitle"),
  taskArea: $("#taskArea"),
  taskCalendarDate: $("#taskCalendarDate"),
  taskCalendarTime: $("#taskCalendarTime"),
  taskAllDay: $("#taskAllDay"),
  taskCalendarSync: $("#taskCalendarSync"),
  taskRepeat: $("#taskRepeat"),
  taskRepeatUntil: $("#taskRepeatUntil"),
  taskLocation: $("#taskLocation"),
  taskDuration: $("#taskDuration"),
  taskImportance: $("#taskImportance"),
  taskFriction: $("#taskFriction"),
  taskConsequence: $("#taskConsequence"),
  taskEnergy: $("#taskEnergy"),
  taskBlocker: $("#taskBlocker"),
  taskAction: $("#taskAction"),
  icsInput: $("#icsInput"),
  icsButton: $("#icsButton"),
  googleCalendarSync: $("#googleCalendarSync"),
  backupInput: $("#backupInput"),
  backupButton: $("#backupButton"),
  exportButton: $("#exportButton"),
  clearDone: $("#clearDone"),
  newRun: $("#newRun"),
  flowButtons: $$(".flow-nav [data-view]"),
  taskCount: $("#taskCount"),
  taskList: $("#taskList"),
  microLane: $("#microLane"),
  autopilotButton: $("#autopilotButton"),
  capacityHours: $("#capacityHours"),
  addWaterButton: $("#addWaterButton"),
  hydrationLabel: $("#hydrationLabel"),
  hydrationFill: $("#hydrationFill"),
  hydrationStatus: $("#hydrationStatus"),
  hydrationMissing: $("#hydrationMissing"),
  hydrationLast: $("#hydrationLast"),
  hydrationGoal: $("#hydrationGoal"),
  hydrationHint: $("#hydrationHint"),
  loadLabel: $("#loadLabel"),
  loadFill: $("#loadFill"),
  overloadHint: $("#overloadHint"),
  dayMap: $("#dayMap"),
  noReason: $("#noReason"),
  noScript: $("#noScript"),
  copyNo: $("#copyNo"),
  scoreNo: $("#scoreNo"),
  rewardGrid: $("#rewardGrid"),
  activityLog: $("#activityLog"),
  coachBackdrop: $("#coachBackdrop"),
  coachPanel: $("#coachPanel"),
  closeCoach: $("#closeCoach"),
  clearCoach: $("#clearCoach"),
  coachTitle: $("#coachTitle"),
  coachMode: $("#coachMode"),
  coachHero: $("#coachHero"),
  coachSteps: $("#coachSteps"),
  coachForm: $("#coachForm"),
  coachInput: $("#coachInput"),
  coachSend: $("#coachSend"),
  coachMessages: $("#coachMessages"),
  cloudStatus: $("#cloudStatus"),
  googleLogin: $("#googleLogin"),
  dailyQuestCount: $("#dailyQuestCount"),
  dailyQuestFill: $("#dailyQuestFill"),
  dailyQuestXp: $("#dailyQuestXp"),
  dailyBossCard: $("#dailyBossCard"),
  comboLabel: $("#comboLabel"),
  comboHint: $("#comboHint"),
  xpBurst: $("#xpBurst"),
  toast: $("#toast"),
  starfield: $("#starfield"),
};

function loadState() {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState();
    const parsed = JSON.parse(saved);
    return mergeState(defaultState(), parsed);
  } catch {
    return defaultState();
  }
}

function mergeState(base, saved) {
  return {
    ...base,
    ...saved,
    profile: { ...base.profile, ...(saved.profile || {}) },
    prefs: { ...base.prefs, ...(saved.prefs || {}) },
    wellness: {
      ...base.wellness,
      ...(saved.wellness || {}),
      hydration: {
        ...base.wellness.hydration,
        ...((saved.wellness || {}).hydration || {}),
      },
    },
    meta: { ...base.meta, ...(saved.meta || {}) },
    timer: { ...base.timer, ...(saved.timer || {}) },
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    history: Array.isArray(saved.history) ? saved.history : [],
  };
}

function saveState({ syncCloud = true } = {}) {
  if (!cloudApplying) {
    state.meta = { ...(state.meta || {}), localUpdatedAt: Date.now() };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (syncCloud) scheduleCloudSave();
}

function firebaseConfig() {
  const config = window.ADHD_FIREBASE_CONFIG;
  if (!config || typeof config !== "object") return null;
  if (!config.apiKey || !config.projectId || !config.appId) return null;
  return config;
}

function updateCloudStatus(status, title = "") {
  if (!els.cloudStatus) return;
  const labels = {
    local: "Locale",
    connecting: "Cloud...",
    synced: "Cloud",
    saving: "Sync...",
    error: "Cloud!",
  };
  els.cloudStatus.textContent = labels[status] || "Locale";
  els.cloudStatus.title = title || {
    local: "Salvataggio solo su questo browser",
    connecting: "Connessione a Firebase",
    synced: "Sincronizzato con Firebase",
    saving: "Salvataggio su Firebase",
    error: "Firebase non raggiungibile",
  }[status] || "";
  els.cloudStatus.className = `cloud-status ${status}`;
}

function updateGoogleLogin(user = firebaseAuth?.currentUser) {
  if (!els.googleLogin) return;
  if (!firebaseAuth || !googleProvider) {
    els.googleLogin.disabled = true;
    els.googleLogin.textContent = "Google";
    els.googleLogin.title = "Firebase non configurato";
    return;
  }
  const isGoogle = Boolean(user?.providerData?.some((provider) => provider.providerId === "google.com"));
  els.googleLogin.disabled = false;
  els.googleLogin.textContent = isGoogle ? "Google ✓" : "Google";
  els.googleLogin.title = isGoogle ? "Account Google collegato" : "Accedi con Google";
  els.googleLogin.classList.toggle("connected", isGoogle);
}

function storeGoogleCalendarToken(token) {
  googleCalendarAccessToken = token || null;
  try {
    if (token) {
      sessionStorage.setItem(GOOGLE_CALENDAR_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(GOOGLE_CALENDAR_TOKEN_KEY);
    }
  } catch {
    // Session storage can be unavailable in some privacy modes.
  }
}

function loadGoogleCalendarToken() {
  if (googleCalendarAccessToken) return googleCalendarAccessToken;
  try {
    googleCalendarAccessToken = sessionStorage.getItem(GOOGLE_CALENDAR_TOKEN_KEY);
  } catch {
    googleCalendarAccessToken = null;
  }
  return googleCalendarAccessToken;
}

function rememberGoogleCredential(result) {
  const credential = window.firebase?.auth?.GoogleAuthProvider?.credentialFromResult?.(result);
  if (credential?.accessToken) {
    storeGoogleCalendarToken(credential.accessToken);
    startGoogleCalendarAutoSync();
  }
  return credential?.accessToken || "";
}

function initFirebaseSync() {
  const config = firebaseConfig();
  if (!config) {
    updateCloudStatus("local");
    updateGoogleLogin(null);
    return;
  }
  if (!window.firebase?.initializeApp || !window.firebase?.auth || !window.firebase?.firestore) {
    updateCloudStatus("error", "Firebase SDK non caricato");
    updateGoogleLogin(null);
    return;
  }

  updateCloudStatus("connecting");
  try {
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
    firebaseAuth = firebase.auth(app);
    firebaseDb = firebase.firestore(app);
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.addScope(GOOGLE_CALENDAR_SCOPE);
    googleProvider.setCustomParameters({ prompt: "select_account" });
    updateGoogleLogin(firebaseAuth.currentUser);
    handleGoogleRedirectResult();

    firebaseAuth.onAuthStateChanged((user) => {
      updateGoogleLogin(user);
      if (!user) {
        firebaseAuth.signInAnonymously().catch((error) => {
          updateCloudStatus("error", `Login Firebase non riuscito: ${error.message}`);
          showToast("Firebase: attiva accesso anonimo");
        });
        return;
      }
      connectCloudState(firebaseDb, user.uid);
    });
  } catch (error) {
    updateCloudStatus("error", `Firebase non configurato: ${error.message}`);
    updateGoogleLogin(null);
  }
}

async function handleGoogleRedirectResult() {
  if (!firebaseAuth?.getRedirectResult) return;
  try {
    const result = await firebaseAuth.getRedirectResult();
    if (result?.user) {
      rememberGoogleCredential(result);
      showToast("Accesso Google effettuato");
      updateGoogleLogin(result.user);
    }
  } catch (error) {
    showToast(googleAuthErrorText(error));
  }
}

async function signInWithGoogle() {
  if (!firebaseAuth || !googleProvider) {
    showToast("Firebase non è ancora pronto");
    return;
  }
  if (els.googleLogin) {
    els.googleLogin.disabled = true;
    els.googleLogin.textContent = "Apro...";
  }

  try {
    const user = firebaseAuth.currentUser;
    if (user?.providerData?.some((provider) => provider.providerId === "google.com")) {
      showToast("Google è già collegato");
      return;
    }

    if (user?.isAnonymous && user.linkWithPopup) {
      try {
        const result = await user.linkWithPopup(googleProvider);
        rememberGoogleCredential(result);
        showToast("Account Google collegato");
        return;
      } catch (error) {
        if (shouldUseRedirect(error) && user.linkWithRedirect) {
          showToast("Apro Google in modalità compatibile");
          await user.linkWithRedirect(googleProvider);
          return;
        }
        if (!["auth/credential-already-in-use", "auth/email-already-in-use", "auth/provider-already-linked"].includes(error.code)) {
          throw error;
        }
      }
    }

    try {
      const result = await firebaseAuth.signInWithPopup(googleProvider);
      rememberGoogleCredential(result);
      showToast("Accesso Google effettuato");
    } catch (error) {
      if (shouldUseRedirect(error) && firebaseAuth.signInWithRedirect) {
        showToast("Apro Google in modalità compatibile");
        await firebaseAuth.signInWithRedirect(googleProvider);
        return;
      }
      throw error;
    }
  } catch (error) {
    showToast(googleAuthErrorText(error));
  } finally {
    updateGoogleLogin(firebaseAuth.currentUser);
  }
}

function shouldUseRedirect(error) {
  return [
    "auth/popup-closed-by-user",
    "auth/popup-blocked",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].includes(error?.code);
}

function googleAuthErrorText(error) {
  if (error?.code === "auth/popup-closed-by-user") return "La finestra Google si è chiusa. Riprova.";
  if (error?.code === "auth/popup-blocked") return "Popup bloccato: abilita popup o riprova.";
  if (error?.code === "auth/unauthorized-domain") {
    return `Firebase non autorizza questo dominio: ${window.location.hostname}. Aggiungilo in Authentication > Settings > Authorized domains.`;
  }
  if (error?.code === "auth/operation-not-allowed") return "Abilita Google in Firebase Authentication.";
  if (error?.code === "auth/account-exists-with-different-credential") return "Questo account usa già un altro metodo di accesso.";
  return `Google non collegato: ${error?.message || "errore sconosciuto"}`;
}

function connectCloudState(db, uid) {
  if (cloudUnsubscribe) cloudUnsubscribe();
  cloudRef = db.collection("users").doc(uid).collection("game").doc("state");
  updateCloudStatus("connecting", "Carico il salvataggio cloud");

  cloudUnsubscribe = cloudRef.onSnapshot(
    (snapshot) => {
      if (!snapshot.exists) {
        pushStateToCloud();
        return;
      }
      applyCloudSnapshot(snapshot.data());
    },
    (error) => {
      updateCloudStatus("error", `Firebase: ${error.message}`);
      showToast("Firebase non raggiungibile");
    },
  );
}

function applyCloudSnapshot(data) {
  const cloudState = data?.state;
  const cloudUpdatedAt = Number(data?.updatedAtMs) || 0;
  const localUpdatedAt = Number(localStorage.getItem(CLOUD_LOCAL_UPDATED_KEY) || state.meta?.localUpdatedAt || 0);

  if (!cloudState || cloudUpdatedAt === cloudLastSavedAt) {
    updateCloudStatus("synced");
    return;
  }

  if (cloudUpdatedAt > localUpdatedAt) {
    cloudApplying = true;
    state = mergeState(defaultState(), cloudState);
    state.meta = { ...(state.meta || {}), localUpdatedAt: cloudUpdatedAt };
    localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY, String(cloudUpdatedAt));
    saveState({ syncCloud: false });
    cloudApplying = false;
    render();
    updateCloudStatus("synced");
    showToast("Salvataggio Firebase caricato");
    return;
  }

  pushStateToCloud();
}

function scheduleCloudSave() {
  if (!cloudRef || cloudApplying) return;
  clearTimeout(cloudSaveHandle);
  cloudSaveHandle = setTimeout(pushStateToCloud, CLOUD_SYNC_DELAY_MS);
}

async function pushStateToCloud() {
  if (!cloudRef || cloudApplying) return;
  const updatedAtMs = Date.now();
  const cloudState = JSON.parse(JSON.stringify({
    ...state,
    meta: { ...(state.meta || {}), localUpdatedAt: updatedAtMs },
  }));

  updateCloudStatus("saving");
  try {
    await cloudRef.set(
      {
        version: 2,
        updatedAtMs,
        state: cloudState,
      },
      { merge: true },
    );
    cloudLastSavedAt = updatedAtMs;
    localStorage.setItem(CLOUD_LOCAL_UPDATED_KEY, String(updatedAtMs));
    updateCloudStatus("synced");
  } catch (error) {
    updateCloudStatus("error", `Firebase: ${error.message}`);
    showToast("Firebase: salvataggio non riuscito");
  }
}

function uid(prefix = "task") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isYesterday(dayKey) {
  if (!dayKey) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return todayKey(yesterday) === dayKey;
}

function levelFromXp(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function xpIntoLevel(xp) {
  return xp % XP_PER_LEVEL;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatDateTime(value) {
  if (!value) return "nessuna scadenza";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data non valida";
  return date.toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTaskSchedule(task) {
  if (task?.calendar?.allDay && task.calendar.date) {
    const date = new Date(`${task.calendar.date}T12:00`);
    if (Number.isNaN(date.getTime())) return "tutto il giorno";
    return `${date.toLocaleDateString("it-IT", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })} · tutto il giorno`;
  }
  return formatDateTime(task?.due);
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDays(count) {
  return `${count} ${count === 1 ? "giorno" : "giorni"}`;
}

function formatMinutesHuman(minutes) {
  const safe = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, "0")}`;
}

function formatLiters(ml) {
  const liters = Math.max(0, Number(ml) || 0) / 1000;
  return `${liters.toLocaleString("it-IT", {
    minimumFractionDigits: liters >= 1 ? 1 : 0,
    maximumFractionDigits: 1,
  })} L`;
}

function formatShortTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function dueHours(task, now = new Date()) {
  if (!task.due) return null;
  const due = new Date(task.due);
  if (Number.isNaN(due.getTime())) return null;
  return (due.getTime() - now.getTime()) / 36e5;
}

function generatedAction(task) {
  const duration = Number(task.duration) || 20;
  if (task.nextAction) return task.nextAction;
  if (duration >= 45) return `Dedica 10 minuti a definire il primo passo per: ${task.title}`;
  if ((Number(task.friction) || 1) >= 4) return `Apri solo l'inizio e prepara il materiale per: ${task.title}`;
  return `Inizia da una micro-azione concreta: ${task.title}`;
}

function scoreTask(task, now = new Date()) {
  let score = 0;
  const reasons = [];
  const hours = dueHours(task, now);
  const importance = Number(task.importance) || 3;
  const friction = Number(task.friction) || 3;
  const consequence = Number(task.consequence) || 3;
  const energyNeed = Number(task.energy) || 2;
  const duration = Number(task.duration) || 20;
  const energyToday = Number(state.prefs.energyToday) || 2;

  if (hours === null) {
    score += 8;
    reasons.push("non ha scadenza: resta visibile senza diventare emergenza finta");
  } else if (hours < 0) {
    score += 90;
    reasons.push("è già oltre la scadenza");
  } else if (hours <= 2) {
    score += 78;
    reasons.push("scade nelle prossime 2 ore");
  } else if (hours <= 8) {
    score += 62;
    reasons.push("scade oggi e ha poco margine");
  } else if (hours <= 24) {
    score += 46;
    reasons.push("scade entro 24 ore");
  } else if (hours <= 72) {
    score += 28;
    reasons.push("arriva nei prossimi 3 giorni");
  } else {
    score += 10;
    reasons.push("ha tempo, quindi non ruba il turno alle urgenze vere");
  }

  score += importance * 9;
  score += consequence * 8;

  if (importance >= 4) reasons.push("ha importanza alta");
  if (consequence >= 4) reasons.push("rimandarla avrebbe conseguenze forti");

  if (task.blocker) {
    score += 19;
    reasons.push("sblocca altre cose");
  }

  if (duration <= 15) {
    score += 10;
    reasons.push("è abbastanza piccola da chiudere subito");
  } else if (duration >= 75 && hours !== null && hours > 24) {
    score -= 8;
    reasons.push("è grande: conviene trattarla come sprint, non come blocco unico");
  }

  if (friction >= 4 && hours !== null && hours <= 24) {
    score += 10;
    reasons.push("è pesante e vicina: meglio non lasciarla fermentare");
  } else if (friction >= 4) {
    score -= 4;
    reasons.push("è pesante: entra solo con un primo passo piccolo");
  }

  if (energyNeed > energyToday) {
    score -= 13;
    reasons.push("richiede più energia di quella che hai segnato oggi");
  } else {
    score += 6;
    reasons.push("è compatibile con l'energia di oggi");
  }

  const capped = clamp(Math.round(score), 0, 160);
  return {
    score: capped,
    reasons: reasons.slice(0, 4),
    band: bandForTask(task, capped, hours),
    slot: suggestedSlot(task, capped, hours),
  };
}

function bandForTask(task, score, hours) {
  if (task.status === "parked") return "parked";
  if (hours !== null && hours < 0) return "now";
  if (hours !== null && hours <= 8) return "now";
  if (score >= 92) return "now";
  if (hours !== null && hours <= 24) return "today";
  if (score >= 62) return "today";
  if (hours !== null && hours <= 96) return "later";
  return "later";
}

function suggestedSlot(task, score, hours) {
  if (task.status === "parked") return "parcheggiata";
  if (hours !== null && hours < 0) return "adesso";
  if (hours !== null && hours <= 2) return "adesso";
  if (hours !== null && hours <= 8) return "oggi, prima della scadenza";
  if (score >= 92) return "prossimo blocco libero";
  if (hours !== null && hours <= 24) return "oggi";
  if (hours !== null && hours <= 72) return "entro 3 giorni";
  return "più avanti";
}

function priorityText(score) {
  if (score >= 100) return "Priorità alta";
  if (score >= 60) return "Priorità media";
  return "Priorità bassa";
}

function slotText(slot) {
  const labels = {
    adesso: "Adesso",
    "oggi, prima della scadenza": "Oggi, prima della scadenza",
    "prossimo blocco libero": "Prossimo blocco libero",
    oggi: "Oggi",
    "entro 3 giorni": "Entro 3 giorni",
    "più avanti": "Più avanti",
    dopo: "Più avanti",
    parcheggiata: "Parcheggiata",
  };
  return labels[slot] || slot;
}

function sourceText(task) {
  if (task.calendar?.google) return "Google Calendar";
  return task.source === "calendar" ? "Calendario" : "Manuale";
}

function rankedTasks(includeParked = false) {
  return state.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => includeParked || task.status !== "parked")
    .map((task) => ({ task, rank: scoreTask(task) }))
    .sort((a, b) => b.rank.score - a.rank.score);
}

function primaryQuest() {
  return rankedTasks(false)[0] || null;
}

function matchesSearch(task, query) {
  if (!query) return true;
  const haystack = [
    task.title,
    task.area,
    task.nextAction,
    task.missedReason,
    sourceText(task),
    formatTaskSchedule(task),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function overloadMessage(loadPercent, todayLoad, capacityMinutes) {
  const planned = formatMinutesHuman(todayLoad);
  const capacity = formatMinutesHuman(capacityMinutes);
  if (loadPercent >= 170) {
    return {
      level: "critical",
      text: `Hai pianificato circa ${planned} su ${capacity}. Oggi stai chiedendo troppo a te stesso: parcheggia senza sensi di colpa.`,
    };
  }
  if (loadPercent >= 130) {
    return {
      level: "danger",
      text: `Hai pianificato circa ${planned} su ${capacity}. Riduci una quest o mettila in attesa.`,
    };
  }
  if (loadPercent >= 105) {
    return {
      level: "warn",
      text: `Hai pianificato circa ${planned} su ${capacity}. Sei appena sopra capienza: proteggi il margine.`,
    };
  }
  if (loadPercent >= 95) {
    return {
      level: "watch",
      text: `Hai pianificato circa ${planned} su ${capacity}. Giornata piena, ma ancora gestibile.`,
    };
  }
  return {
    level: "calm",
    text: `Hai pianificato circa ${planned} su ${capacity}. C'è spazio per respirare.`,
  };
}

function dayLoadInfo() {
  const openRanked = rankedTasks(true).filter(({ task }) => task.status !== "parked");
  const capacityMinutes = Number(state.prefs.capacityHours || 4) * 60;
  const todayLoad = openRanked
    .filter(({ rank }) => rank.band === "now" || rank.band === "today")
    .reduce((sum, { task }) => sum + (Number(task.duration) || 20), 0);
  const loadPercent = capacityMinutes ? Math.round((todayLoad / capacityMinutes) * 100) : 0;
  return { openRanked, capacityMinutes, todayLoad, loadPercent };
}

function hydrationState() {
  const base = defaultState().wellness.hydration;
  state.wellness = { ...(state.wellness || {}) };
  const hydration = {
    ...base,
    ...(state.wellness.hydration || {}),
  };
  const today = todayKey();
  if (hydration.day !== today) {
    hydration.day = today;
    hydration.ml = 0;
    hydration.lastDrinkAt = null;
  }
  hydration.goalMl = clamp(Number(hydration.goalMl) || 2000, 500, 5000);
  hydration.ml = clamp(Number(hydration.ml) || 0, 0, 8000);
  hydration.streak = Number(hydration.streak) || 0;
  state.wellness.hydration = hydration;
  return hydration;
}

function hydrationProgress(hydration = hydrationState()) {
  const goal = Number(hydration.goalMl) || 2000;
  const ml = Number(hydration.ml) || 0;
  const percent = goal ? Math.round((ml / goal) * 100) : 0;
  const hour = new Date().getHours();
  const expected = goal * clamp((hour - 7) / 15, 0.08, 1);
  return {
    ml,
    goal,
    percent,
    missing: Math.max(0, goal - ml),
    expected,
    behind: ml + 250 < expected,
    reached: ml >= goal,
  };
}

function hydrationStatusText(progress = hydrationProgress()) {
  if (progress.reached) return "Obiettivo fatto";
  if (progress.percent >= 70) return "Buona";
  if (progress.percent >= 40) return "Da sostenere";
  if (progress.behind) return "Bassa";
  return "In partenza";
}

function hydrationHintText(loadPercent) {
  const hydration = hydrationState();
  const progress = hydrationProgress(hydration);
  if (progress.reached) {
    const streak = Number(hydration.streak) || 0;
    return streak >= 2 ? `Obiettivo raggiunto. Serie benessere: ${streak} giorni.` : "Obiettivo idratazione raggiunto per oggi.";
  }
  if (Number(state.prefs.focusMinutes) >= 45 && progress.percent < 70) {
    return "Prima di uno sprint lungo, bevi un bicchiere: aiuta a non arrivare scarico al blocco successivo.";
  }
  if (loadPercent >= 105 && progress.percent < 70) {
    return `Giornata carica e idratazione a ${progress.percent}%. Prima di iniziare un'altra attività, fai una pausa da 2 minuti.`;
  }
  if (progress.behind) {
    return `Hai bevuto ${formatLiters(progress.ml)} oggi. Un bicchiere ora può aiutarti prima del prossimo blocco.`;
  }
  return "Buon ritmo: resta solo una variabile di supporto, non un'altra missione.";
}

function hydrationNeedsNudge() {
  const progress = hydrationProgress();
  return !progress.reached && (progress.behind || progress.percent < 45);
}

function bossState() {
  const day = todayKey();
  const boss = state.meta?.dailyBoss;
  if (boss?.day === day) {
    if (boss.defeated) return boss;
    const existing = boss.taskId ? taskById(boss.taskId) : null;
    if (existing) return boss;
  }
  const candidate = rankedTasks(false)[0];
  state.meta = {
    ...(state.meta || {}),
    dailyBoss: {
      day,
      taskId: candidate?.task?.id || null,
      defeated: false,
    },
  };
  saveState({ syncCloud: false });
  return state.meta.dailyBoss;
}

function dailyBoss() {
  const boss = bossState();
  if (!boss.taskId) return { state: boss, task: null, rank: null };
  const task = taskById(boss.taskId);
  if (!task) return { state: boss, task: null, rank: null };
  if (task.status === "done" && !boss.defeated) boss.defeated = true;
  return { state: boss, task, rank: scoreTask(task) };
}

function isDailyBoss(id) {
  const boss = bossState();
  return boss.taskId === id && !boss.defeated;
}

function defeatDailyBoss(task) {
  const boss = bossState();
  if (boss.taskId !== task.id || boss.defeated) return 0;
  boss.defeated = true;
  award({
    xp: BOSS_REWARD_XP,
    coins: BOSS_REWARD_COINS,
    text: `Boss sconfitto: ${task.title} (+${BOSS_REWARD_XP} XP)`,
  });
  return BOSS_REWARD_XP;
}

function updateCombo() {
  const now = Date.now();
  const last = state.profile.lastComboAt ? new Date(state.profile.lastComboAt).getTime() : 0;
  const stillActive = last && now - last <= COMBO_WINDOW_MS;
  state.profile.comboCount = stillActive ? (Number(state.profile.comboCount) || 0) + 1 : 1;
  state.profile.bestCombo = Math.max(Number(state.profile.bestCombo) || 0, state.profile.comboCount);
  state.profile.lastComboAt = new Date(now).toISOString();

  if (state.profile.comboCount >= 3) {
    const bonus = Math.min(30, (state.profile.comboCount - 2) * 5 + 10);
    award({
      xp: bonus,
      coins: 0,
      text: `Combo x${state.profile.comboCount} (+${bonus} XP bonus)`,
    });
    return bonus;
  }
  return 0;
}

function currentComboCount() {
  const combo = Number(state.profile.comboCount) || 0;
  const last = state.profile.lastComboAt ? new Date(state.profile.lastComboAt).getTime() : 0;
  if (!combo || !last) return 0;
  return Date.now() - last <= COMBO_WINDOW_MS ? combo : 0;
}

function breakCombo() {
  state.profile.comboCount = 0;
  state.profile.lastComboAt = null;
}

function addHistory(text, tone = "good") {
  state.history.unshift({
    id: uid("log"),
    text,
    tone,
    at: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 30);
}

function showToast(message) {
  clearTimeout(toastHandle);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastHandle = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function completedTodayCount() {
  const today = todayKey();
  return state.tasks.filter((task) => task.status === "done" && task.completedAt && todayKey(new Date(task.completedAt)) === today).length;
}

function xpToday() {
  const today = todayKey();
  return state.history.reduce((sum, entry) => {
    if (!entry.at || todayKey(new Date(entry.at)) !== today) return sum;
    const match = String(entry.text || "").match(/\+(\d+)\s*XP/i);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}

function showXpBurst(xp, label = "Quest completata") {
  if (!els.xpBurst || !xp) return;
  els.xpBurst.innerHTML = `
    <strong>+${xp} XP</strong>
    <span>${escapeHtml(label)}</span>
  `;
  els.xpBurst.classList.remove("show");
  void els.xpBurst.offsetWidth;
  els.xpBurst.classList.add("show");
}

function award({ xp = 0, coins = 0, text }) {
  const beforeLevel = levelFromXp(state.profile.xp);
  state.profile.xp += xp;
  state.profile.coins += coins;
  const afterLevel = levelFromXp(state.profile.xp);
  if (text) addHistory(text);
  if (xp) showXpBurst(xp, text ? text.replace(/\s*\(\+\d+\s*XP\)/i, "") : "XP guadagnata");
  if (afterLevel > beforeLevel) {
    addHistory(`Livello ${afterLevel} raggiunto`, "level");
    showToast(`Livello ${afterLevel} sbloccato`);
  }
}

function completeTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === "done") return;
  const bossBeforeComplete = isDailyBoss(id);

  task.status = "done";
  task.completedAt = new Date().toISOString();

  const today = todayKey();
  if (state.profile.lastDoneDay !== today) {
    state.profile.streak = isYesterday(state.profile.lastDoneDay)
      ? state.profile.streak + 1
      : 1;
    state.profile.lastDoneDay = today;
  }

  const hours = dueHours(task);
  const urgencyBonus = hours !== null && hours <= 24 ? 18 : 6;
  const xp = 20 + (Number(task.importance) || 3) * 8 + (Number(task.friction) || 3) * 5 + urgencyBonus;
  const coins = 5 + Math.ceil((Number(task.duration) || 20) / 15);
  award({
    xp,
    coins,
    text: `Completata: ${task.title} (+${xp} XP)`,
  });
  const bossXp = bossBeforeComplete ? defeatDailyBoss(task) : 0;
  const comboXp = updateCombo();
  if (state.timer.taskId === id) stopTimer(false);
  saveAndRender();
  if (bossXp) {
    showToast(`Boss sconfitto: +${xp + bossXp + comboXp} XP`);
  } else if (comboXp) {
    showToast(`Combo x${state.profile.comboCount}: +${xp + comboXp} XP`);
  } else {
    showToast(`Missione chiusa: +${xp} XP`);
  }
}

function parkTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = task.status === "parked" ? "open" : "parked";
  breakCombo();
  addHistory(`${task.status === "parked" ? "Parcheggiata" : "Riattivata"}: ${task.title}`);
  saveAndRender();
}

function missTask(id, reason = "") {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || task.status === "done") return;
  const cleanReason = reason.trim() || "da capire";
  task.status = "open";
  task.missedCount = (Number(task.missedCount) || 0) + 1;
  task.lastMissedAt = new Date().toISOString();
  task.missedReason = cleanReason;
  task.duration = Math.min(Number(task.duration) || 20, 15);
  task.friction = Math.min(5, (Number(task.friction) || 3) + 1);
  task.nextAction = recoveryAction(task, cleanReason);
  task.coachMessages = Array.isArray(task.coachMessages) ? task.coachMessages : [];
  task.coachMessages.push({
    role: "assistant",
    text: recoveryCoachText(task, cleanReason),
    at: new Date().toISOString(),
  });
  task.coachMessages = task.coachMessages.slice(-COACH_HISTORY_LIMIT);
  breakCombo();
  addHistory(`Non fatta: ${task.title}. Recupero più piccolo pronto.`, "quiet");
  if (state.timer.taskId === id) stopTimer(true);
  selectedCoachTaskId = id;
  saveAndRender();
  openCoach(id);
  showToast("Nessuna penalità: ho preparato un recupero");
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  state.tasks = state.tasks.filter((item) => item.id !== id);
  if (task) addHistory(`Rimossa: ${task.title}`, "quiet");
  saveAndRender();
}

function splitTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.nextAction = firstStepAction(task);
  task.duration = Math.min(Number(task.duration) || 20, 15);
  task.friction = Math.max(1, Number(task.friction || 3) - 1);
  addHistory(`Ridotta in primo passo: ${task.title}`);
  selectedCoachTaskId = id;
  saveAndRender();
  openCoach(id);
}

function restoreTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = "open";
  task.completedAt = null;
  addHistory(`Riaperta: ${task.title}`, "quiet");
  saveAndRender();
}

function recoveryAction(task, reason) {
  const lower = reason.toLowerCase();
  if (lower.includes("energia")) return "fai solo 5 minuti, senza completare tutto";
  if (lower.includes("tempo")) return "trova il prossimo buco da 10 minuti e prepara solo l'inizio";
  if (lower.includes("grande") || lower.includes("troppo")) return "spezza in una singola azione da 10 minuti";
  if (lower.includes("diment")) return "mettila in vista e fai subito un segno di avanzamento";
  if (task.source === "calendar") return "decidi se recuperare, riprogrammare o creare una nuova quest";
  return "riparti da una versione più piccola di 10 minuti";
}

function firstStepAction(task) {
  if (task.source === "calendar") return "controlla cosa richiede l'evento e prepara un output concreto";
  if (task.area === "relazioni") return "scrivi una bozza imperfetta di 2 righe";
  if ((Number(task.friction) || 1) >= 4) return "apri solo l'inizio e prepara il materiale";
  return "fai 10 minuti di avvio, senza cercare di finire tutto";
}

function recoveryCoachText(task, reason) {
  const reasonText = reason && reason !== "da capire" ? ` Motivo segnato: ${reason}.` : "";
  const question = reason === "da capire" ? " Se vuoi, scrivimi qui sotto cosa l'ha bloccata." : "";
  return `Ok, non è una sconfitta: è un dato.${reasonText} Io ripartirei da: ${recoveryAction(task, reason)}.${question}`;
}

function saveAndRender() {
  saveState();
  render();
}

function render() {
  document.body.dataset.theme = state.profile.theme || "default";
  renderFlowView();
  renderProfile();
  renderDailyQuest();
  renderMission();
  renderTimer();
  renderMicroLane();
  renderTasks();
  renderDayMap();
  renderHydration();
  renderRewards();
  renderNoScript();
  renderLog();
  if (selectedCoachTaskId) renderCoach();
  updateSegmentState();
}

function renderFlowView() {
  const viewAliases = {
    now: "today",
    capture: "quest",
    plan: "quest",
    kit: "more",
  };
  const validViews = new Set(["today", "quest", "dungeon", "progress", "more"]);
  const candidate = viewAliases[state.prefs.view] || state.prefs.view;
  const view = validViews.has(candidate) ? candidate : "today";
  state.prefs.view = view;
  document.body.dataset.view = view;
  els.flowButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function renderProfile() {
  const level = levelFromXp(state.profile.xp);
  const progress = (xpIntoLevel(state.profile.xp) / XP_PER_LEVEL) * 100;
  const name = state.profile.name || "";
  const avatar = state.profile.avatar || "";

  els.profileName.value = name;
  els.avatarButton.classList.toggle("has-image", Boolean(avatar));
  els.avatarImage.src = avatar;
  els.avatarInitial.textContent = name ? name.trim().charAt(0).toUpperCase() : "?";
  els.levelLabel.textContent = `Lv ${level}`;
  els.xpFill.style.width = `${progress}%`;
  els.xpLabel.textContent = `${xpIntoLevel(state.profile.xp)} / ${XP_PER_LEVEL} XP`;
  els.coinCount.textContent = state.profile.coins;
  els.streakLabel.textContent = formatDays(state.profile.streak || 0);
  els.capacityHours.value = state.prefs.capacityHours;
  if (els.globalSearch) els.globalSearch.value = state.prefs.search || "";
}

function renderDailyQuest() {
  const done = completedTodayCount();
  const cappedDone = Math.min(done, DAILY_QUEST_TARGET);
  const progress = (cappedDone / DAILY_QUEST_TARGET) * 100;
  if (els.dailyQuestCount) els.dailyQuestCount.textContent = `${cappedDone} / ${DAILY_QUEST_TARGET}`;
  if (els.dailyQuestFill) els.dailyQuestFill.style.width = `${progress}%`;
  if (els.dailyQuestXp) els.dailyQuestXp.textContent = `+${xpToday()} XP oggi`;

  const boss = dailyBoss();
  if (els.dailyBossCard) {
    if (!boss.task) {
      els.dailyBossCard.innerHTML = `
        <span class="kicker">Boss del giorno</span>
        <strong>Nessun boss</strong>
        <span>Evoca una quest per farlo apparire.</span>
      `;
      els.dailyBossCard.classList.remove("defeated");
    } else {
      els.dailyBossCard.classList.toggle("defeated", Boolean(boss.state.defeated));
      els.dailyBossCard.innerHTML = `
        <span class="kicker">Boss del giorno</span>
        <strong>${boss.state.defeated ? "Boss sconfitto" : escapeHtml(boss.task.title)}</strong>
        <span>${boss.state.defeated ? `Ricompensa riscossa: +${BOSS_REWARD_XP} XP` : `Ricompensa +${BOSS_REWARD_XP} XP · +${BOSS_REWARD_COINS} Focus`}</span>
      `;
    }
  }

  const combo = currentComboCount();
  if (els.comboLabel) els.comboLabel.textContent = combo ? `x${combo}` : "x0";
  if (els.comboHint) {
    els.comboHint.textContent = combo >= 3
      ? `Combo attiva · record x${state.profile.bestCombo || combo}`
      : combo
        ? "Continua senza interromperti"
        : "Chiudi quest consecutive";
  }
}

function renderMission() {
  const primary = primaryQuest();
  if (!primary) {
    els.priorityScore.textContent = "--";
    els.missionState.innerHTML = `
      <div class="empty-state game-empty">
        <strong>Nuova partita pronta.</strong>
        <span>Evoca la prima quest quando vuoi.</span>
      </div>
    `;
    els.whyList.innerHTML = "";
    els.timerTask.textContent = "In attesa";
    toggleMissionButtons(false);
    return;
  }

  const { task, rank } = primary;
  els.priorityScore.textContent = rank.score;
  els.timerTask.textContent = shortText(task.title, 14);
  els.missionState.innerHTML = `
    <h3>${escapeHtml(task.title)}</h3>
    <p class="next-action">${escapeHtml(generatedAction(task))}</p>
    <div class="mission-submeta">
      <span>${slotText(rank.slot)}</span>
      <span>${formatTaskSchedule(task)}</span>
      <span>${task.duration || 20} min</span>
      ${task.missedCount ? "<span>Recupero</span>" : ""}
    </div>
  `;
  els.whyList.innerHTML = rank.reasons
    .slice(0, 1)
    .map((reason) => `<li><strong>Perché ora</strong><span>${escapeHtml(reason)}</span></li>`)
    .join("");
  toggleMissionButtons(true);
}

function toggleMissionButtons(enabled) {
  [els.startFocus, els.pauseFocus, els.completePrimary, els.parkPrimary, els.missPrimary, els.splitPrimary, els.coachPrimary].forEach((button) => {
    button.disabled = !enabled;
  });
}

function renderTimer() {
  els.timerClock.textContent = formatClock(state.timer.remaining);
  const total = Math.max(1, Number(state.prefs.focusMinutes || 10) * 60);
  const elapsed = clamp(total - Number(state.timer.remaining || 0), 0, total);
  const progress = (elapsed / total) * 100;
  els.timerProgressFill.style.width = `${progress}%`;
  els.timerClock.closest(".timer-ring")?.classList.toggle("running", Boolean(state.timer.running));
  els.startFocus.innerHTML = state.timer.running
    ? '<svg><use href="#icon-check"></use></svg>In corso'
    : '<svg><use href="#icon-play"></use></svg>Avvia';
}

function renderMicroLane() {
  if (!els.microLane) return;
  const query = state.prefs.search || "";
  const microTasks = rankedTasks(false)
    .filter(({ task }) => task.status === "open")
    .filter(({ task }) => (Number(task.duration) || 20) <= 10)
    .filter(({ task }) => matchesSearch(task, query))
    .slice(0, 5);

  if (!microTasks.length) {
    els.microLane.innerHTML = `
      <div>
        <span class="kicker">Micro</span>
        <strong>Vuota</strong>
      </div>
      <span class="micro-empty">Niente da chiudere in 5 minuti.</span>
    `;
    return;
  }

  els.microLane.innerHTML = `
    <div>
      <span class="kicker">Micro</span>
      <strong>${microTasks.length} rapide</strong>
    </div>
    <div class="micro-dots">
      ${microTasks
        .map(({ task }) => `
          <button data-micro-task-id="${task.id}" type="button" title="${escapeHtml(task.title)}">
            <span></span>
            ${escapeHtml(shortText(task.title, 20))}
          </button>
        `)
        .join("")}
    </div>
  `;
}

function renderTasks() {
  const filter = state.prefs.filter;
  const query = state.prefs.search || "";
  const tasks = state.tasks
    .filter((task) => {
      if (filter === "done") return task.status === "done";
      if (filter === "parked") return task.status === "parked";
      return task.status !== "done" && task.status !== "parked";
    })
    .filter((task) => matchesSearch(task, query))
    .map((task) => ({ task, rank: scoreTask(task) }))
    .sort((a, b) => {
      if (filter === "done") return new Date(b.task.completedAt || 0) - new Date(a.task.completedAt || 0);
      return b.rank.score - a.rank.score;
    });

  els.taskCount.textContent = `${tasks.length}`;
  if (!tasks.length) {
    els.taskList.innerHTML = `<div class="empty-state"><span>${query ? "Nessuna quest trovata." : "Diario vuoto."}</span></div>`;
    return;
  }

  els.taskList.innerHTML = tasks
    .map(({ task, rank }) => {
      const done = task.status === "done";
      const parked = task.status === "parked";
      const bandClass = rank.band === "now" ? "danger" : rank.band === "today" ? "now" : "blue";
      const statusText = done ? "Fatta" : parked ? "Parcheggiata" : `${rank.score} pt`;
      const weight = parked ? 42 : clamp(rank.score, 36, 100);
      const weightClass = parked ? "parked" : rank.score >= 92 ? "important" : rank.score >= 62 ? "normal" : "light";
      return `
        <article class="task-card ${done ? "done" : ""} weight-${weightClass}" data-task-id="${task.id}" role="button" tabindex="0" style="--quest-weight: ${weight}%">
          <div class="quest-weight-bar" aria-hidden="true"><span></span></div>
          <div class="task-topline">
            <div>
              <div class="task-title">${escapeHtml(task.title)}</div>
              <div class="task-meta">
                <span>${formatTaskSchedule(task)}</span>
                <span>${task.duration || 20} min</span>
                <span>${escapeHtml(task.area)}</span>
              </div>
            </div>
            <div class="task-actions">
              <button class="guide-button" data-action="coach" title="Apri guida">Guida</button>
              ${
                done
                  ? `<button data-action="restore" title="Riapri"><svg><use href="#icon-refresh"></use></svg></button>`
                  : `<button data-action="done" title="Fatto"><svg><use href="#icon-check"></use></svg></button>
                     <button class="miss-button" data-action="miss" title="Non fatta">!</button>
                     <button data-action="park" title="${parked ? "Riattiva" : "Parcheggia"}"><svg><use href="#icon-pause"></use></svg></button>`
              }
              <button data-action="delete" title="Elimina"><svg><use href="#icon-trash"></use></svg></button>
            </div>
          </div>
          <div class="tag-row">
            <span class="tag ${bandClass}">${statusText}</span>
            <span class="tag">${slotText(rank.slot)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDayMap() {
  const ranked = rankedTasks(true);
  const openRanked = ranked.filter(({ task }) => task.status !== "parked");
  const capacityMinutes = Number(state.prefs.capacityHours || 4) * 60;
  const todayLoad = openRanked
    .filter(({ rank }) => rank.band === "now" || rank.band === "today")
    .reduce((sum, { task }) => sum + (Number(task.duration) || 20), 0);
  const loadPercent = capacityMinutes ? Math.round((todayLoad / capacityMinutes) * 100) : 0;
  const capped = clamp(loadPercent, 0, 140);
  const overload = overloadMessage(loadPercent, todayLoad, capacityMinutes);
  els.loadLabel.textContent = `${loadPercent}%`;
  els.loadFill.style.width = `${Math.min(capped, 100)}%`;
  els.loadFill.style.background =
    loadPercent > 100
      ? "linear-gradient(90deg, var(--amber), var(--red))"
      : "linear-gradient(90deg, var(--green), var(--amber))";
  if (els.overloadHint) {
    const overloadRoot = els.overloadHint.closest(".overload");
    overloadRoot?.classList.remove("calm", "watch", "warn", "danger", "critical");
    overloadRoot?.classList.add(overload.level);
    els.overloadHint.className = `overload-hint ${overload.level}`;
    els.overloadHint.textContent = overload.text;
  }

  const todayItems = openRanked
    .filter(({ task, rank }) => {
      const hours = dueHours(task);
      return rank.band === "now" || rank.band === "today" || (hours !== null && hours <= 24);
    })
    .slice(0, 5);
  const agendaLanes = [
    { id: "now", label: "Adesso", items: openRanked.filter(({ rank }) => rank.band === "now").slice(0, 2) },
    { id: "today", label: "Oggi", items: openRanked.filter(({ rank }) => rank.band === "today").slice(0, 2) },
  ];
  const parkedLane = { id: "parked", label: "Parcheggio", items: ranked.filter(({ task }) => task.status === "parked").slice(0, 3) };
  const renderLane = (lane) => `
    <div class="map-lane ${lane.id}">
      <h3>${lane.label}</h3>
      ${
        lane.items.length
          ? lane.items
              .map(({ task, rank }) => `
                <button class="map-item ${lane.id}" data-map-task-id="${task.id}" type="button">
                  <span class="map-accent"></span>
                  <div class="map-content">
                    <strong>${escapeHtml(task.title)}</strong>
                    <span>${priorityText(rank.score)} · ${slotText(rank.slot)}</span>
                  </div>
                </button>
              `)
              .join("")
          : `<div class="map-item ${lane.id}">
              <span class="map-accent"></span>
              <div class="map-content"><span>vuoto</span></div>
            </div>`
      }
    </div>
  `;

  els.dayMap.innerHTML = `
    <section class="dungeon-block">
      <h3 class="dungeon-label">Agenda</h3>
      <div class="today-timeline">
        ${
          todayItems.length
            ? todayItems
                .map(({ task }) => {
                  const date = task.due ? new Date(task.due) : null;
                  const time = date && !Number.isNaN(date.getTime())
                    ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
                    : "Oggi";
                  return `
                    <button class="timeline-item" data-map-task-id="${task.id}" type="button">
                      <span>${time}</span>
                      <strong>${escapeHtml(task.title)}</strong>
                    </button>
                  `;
                })
                .join("")
            : `<div class="timeline-empty">Nessuna quest urgente oggi.</div>`
        }
      </div>
      <div class="compact-lanes agenda-lanes">
        ${agendaLanes.map(renderLane).join("")}
      </div>
    </section>

    <div class="dungeon-divider" aria-hidden="true"></div>

    <section class="dungeon-block parked-block">
      ${renderLane(parkedLane)}
    </section>
  `;
}

function renderHydration() {
  const hydration = hydrationState();
  const progress = hydrationProgress(hydration);
  const { loadPercent } = dayLoadInfo();
  const card = els.hydrationHint?.closest(".hydration-card");
  const status = hydrationStatusText(progress);

  if (card) {
    card.classList.remove("low", "good", "done");
    card.classList.add(progress.reached ? "done" : progress.behind ? "low" : "good");
  }
  if (els.hydrationLabel) {
    els.hydrationLabel.textContent = `${formatLiters(progress.ml)} / ${formatLiters(progress.goal)}`;
  }
  if (els.hydrationFill) {
    els.hydrationFill.style.width = `${Math.min(progress.percent, 100)}%`;
  }
  if (els.hydrationStatus) els.hydrationStatus.textContent = status;
  if (els.hydrationMissing) els.hydrationMissing.textContent = progress.missing ? formatLiters(progress.missing) : "0 L";
  if (els.hydrationLast) els.hydrationLast.textContent = formatShortTime(hydration.lastDrinkAt);
  if (els.hydrationGoal && document.activeElement !== els.hydrationGoal) {
    els.hydrationGoal.value = (progress.goal / 1000).toFixed(1);
  }
  if (els.hydrationHint) els.hydrationHint.textContent = hydrationHintText(loadPercent);
}

function renderRewards() {
  const level = levelFromXp(state.profile.xp);
  els.rewardGrid.innerHTML = rewards
    .map((reward) => {
      const unlocked = level >= reward.level;
      const canUseTheme = unlocked && reward.theme;
      const activeTheme = state.profile.theme === reward.theme;
      return `
        <button class="reward-card ${unlocked ? "" : "locked"}" data-theme-choice="${reward.theme || ""}" ${canUseTheme ? "" : "disabled"} type="button">
          <strong>${escapeHtml(reward.name)}</strong>
          <span class="reward-meta">Lv ${reward.level} · ${escapeHtml(reward.meta)}</span>
          <span class="tag ${unlocked ? "good" : ""}">${unlocked ? (activeTheme ? "attiva" : "sbloccata") : "bloccata"}</span>
        </button>
      `;
    })
    .join("");
}

function renderNoScript() {
  els.noScript.value = noScripts[els.noReason.value] || noScripts.capacity;
}

function renderLog() {
  if (!state.history.length) {
    els.activityLog.innerHTML = `<div class="empty-state"><span>Cronaca vuota.</span></div>`;
    return;
  }
  els.activityLog.innerHTML = state.history
    .slice(0, 10)
    .map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<div class="log-entry"><strong>${time}</strong> ${escapeHtml(entry.text)}</div>`;
    })
    .join("");
}

function taskById(id) {
  return state.tasks.find((task) => task.id === id) || null;
}

function openCoach(taskId) {
  const task = taskById(taskId);
  if (!task) return;
  selectedCoachTaskId = taskId;
  renderCoach();
  refreshCoachStatus();
  els.coachPanel.classList.add("open");
  els.coachPanel.setAttribute("aria-hidden", "false");
  els.coachBackdrop.hidden = false;
}

function closeCoach() {
  selectedCoachTaskId = null;
  els.coachPanel.classList.remove("open");
  els.coachPanel.setAttribute("aria-hidden", "true");
  els.coachBackdrop.hidden = true;
}

function renderCoach() {
  if (!selectedCoachTaskId) return;
  const task = taskById(selectedCoachTaskId);
  if (!task) {
    closeCoach();
    return;
  }
  const rank = scoreTask(task);
  const cards = coachCards(task, rank);
  updateCoachMode(task);
  els.coachTitle.textContent = task.title;
  els.coachHero.innerHTML = `
    <div class="coach-orb ${rank.band}">
      <strong>${priorityText(rank.score).replace("Priorità ", "")}</strong>
      <span>${slotText(rank.slot)}</span>
    </div>
    <div class="coach-hero-copy">
      <div class="tag-row">
        <span class="tag">${sourceText(task)}</span>
        <span class="tag">Durata: ${task.duration || 20} min</span>
        <span class="tag">Quando: ${formatTaskSchedule(task)}</span>
        ${task.missedCount ? '<span class="tag recover">Recupero</span>' : ""}
      </div>
      <p>${escapeHtml(generatedAction(task))}</p>
    </div>
  `;
  els.coachSteps.innerHTML = cards
    .map((card, index) => `
      <article class="coach-step">
        <span class="step-number">${index + 1}</span>
        <div>
          <strong>${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.text)}</p>
        </div>
      </article>
    `)
    .join("");

  const messages = Array.isArray(task.coachMessages) ? task.coachMessages : [];
  els.coachMessages.innerHTML = messages.length
    ? messages
        .slice(-10)
        .map((message) => `
          <div class="coach-message ${message.role} ${message.pending ? "pending" : ""} ${message.mode === "offline" ? "offline" : ""}">
            <strong>${escapeHtml(coachSpeaker(message))}</strong>
            <span>${escapeHtml(message.text)}</span>
          </div>
        `)
        .join("")
    : `<div class="coach-message assistant">
        <strong>Coach</strong>
        <span>Dimmi cosa vuoi preparare, cosa ti blocca o quale scelta non è chiara.</span>
      </div>`;
  requestAnimationFrame(() => {
    els.coachMessages.scrollTop = els.coachMessages.scrollHeight;
  });
}

function coachSpeaker(message) {
  if (message.role === "user") return "Tu";
  if (message.pending) return "Coach AI";
  if (message.mode === "ai") return "Coach AI";
  if (message.mode === "offline") return "Guida locale";
  return "Coach";
}

function updateCoachMode(task = taskById(selectedCoachTaskId)) {
  if (!els.coachMode) return;
  const isOffline = coachAiReady === false || (coachAiReady === null && task?.aiFallback === true);
  els.coachMode.textContent = isOffline ? "Offline" : "AI";
  els.coachMode.title = isOffline
    ? "Coach locale: collega OpenAI per risposte AI vere"
    : "Coach AI";
  els.coachMode.classList.toggle("offline", isOffline);
}

async function refreshCoachStatus() {
  try {
    const response = await fetch(`${COACH_ENDPOINT}/status`, { cache: "no-store" });
    if (!response.ok) throw new Error("Status non disponibile");
    const data = await response.json();
    coachAiReady = Boolean(data.configured);
    const task = taskById(selectedCoachTaskId);
    if (coachAiReady && task) task.aiFallback = false;
  } catch {
    coachAiReady = false;
  }
  updateCoachMode();
}

function coachCards(task, rank) {
  const cards = [
    { title: "Primo passo", text: generatedAction(task) },
    { title: "Prepara", text: preparationText(task) },
    { title: "Evita il blocco", text: riskText(task, rank) },
    { title: "Chiusura", text: finishText(task) },
  ];
  if (task.missedCount) {
    cards.unshift({
      title: "Recupero",
      text: recoveryCoachText(task, task.missedReason || ""),
    });
  }
  return cards;
}

function preparationText(task) {
  const inferred = inferredPreparation(task);
  if (inferred) return inferred;
  if (task.source === "calendar") {
    return "Controlla orario, contesto e obiettivo dell'evento. Prepara una nota, domanda o materiale da portare.";
  }
  if (task.area === "relazioni") {
    return "Scrivi una bozza imperfetta. Non correggerla finché non esiste.";
  }
  if (task.area === "salute") {
    return "Prepara documento, numero o app. Tieni vicino solo ciò che serve.";
  }
  if ((Number(task.friction) || 1) >= 4) {
    return "Riduci il campo: un file, una telefonata, una frase. Vietato risolvere tutto subito.";
  }
  return "Libera il piano, apri lo strumento giusto, avvia un timer breve.";
}

function inferredPreparation(task) {
  const text = `${task.title || ""} ${task.area || ""}`.toLowerCase();
  if (text.includes("commercialista") || text.includes("tasse") || text.includes("fisc") || text.includes("contabil")) {
    return "Prepara tre cose: documenti o ricevute, una lista di domande, e il punto più urgente da chiarire.";
  }
  if (text.includes("riunione") || text.includes("meeting") || text.includes("call")) {
    return "Scrivi obiettivo della riunione, 3 punti da dire e una domanda da fare se perdi il filo.";
  }
  if (text.includes("visita") || text.includes("medic") || text.includes("dottor") || text.includes("salute")) {
    return "Tieni pronti documento, eventuali referti e una lista breve di sintomi o domande.";
  }
  if (text.includes("bollett") || text.includes("pag") || text.includes("fattur")) {
    return "Metti davanti importo, scadenza e app o sito per pagare. Chiudi solo quel pagamento.";
  }
  if (text.includes("mail") || text.includes("email") || text.includes("messaggio") || text.includes("rispond")) {
    return "Apri una bozza con destinatario, una frase centrale e una richiesta finale chiara.";
  }
  if (text.includes("spesa")) {
    return "Scrivi solo le 5 cose indispensabili e decidi il negozio prima di uscire.";
  }
  if (text.includes("pul") || text.includes("casa")) {
    return "Scegli una sola zona, prepara sacco o panno, e fai 10 minuti senza cambiare stanza.";
  }
  return "";
}

function riskText(task, rank) {
  if ((Number(task.energy) || 2) > (Number(state.prefs.energyToday) || 2)) {
    return "Richiede energia: fai solo la versione minima e poi rivaluti.";
  }
  if (rank.band === "now") {
    return "Non ottimizzare. Fai la cosa utile, non quella perfetta.";
  }
  if ((Number(task.duration) || 20) >= 60) {
    return "È grande: spezzala in blocchi da 15 minuti.";
  }
  return "Se ti perdi, torna al primo passo e ignora il resto.";
}

function finishText(task) {
  if (task.source === "calendar") {
    return "Quando finisce, segna fatto o parcheggia il seguito come nuova quest.";
  }
  return "Quando hai completato il primo risultato visibile, premi Fatto e incassa XP.";
}

function coachReply(task, text) {
  const lower = text.toLowerCase();
  const rank = scoreTask(task);
  const action = generatedAction(task);
  const prep = preparationText(task);
  const minutes = Math.min(Number(task.duration) || 20, 25);

  if (lower.includes("ansia") || lower.includes("paura") || lower.includes("blocc")) {
    return [
      `Non devi chiudere "${task.title}" adesso: devi solo renderla meno minacciosa.`,
      `Prima mossa: ${action}.`,
      "Versione minima: 5 minuti, risultato anche imperfetto, poi stop e rivaluti.",
    ].join("\n");
  }
  if (lower.includes("tempo") || lower.includes("quanto") || lower.includes("quando")) {
    return [
      `Slot consigliato: ${slotText(rank.slot).toLowerCase()}.`,
      `Timer: ${minutes} minuti.`,
      `Prima cosa da fare quando parte il timer: ${action}.`,
    ].join("\n");
  }
  if (lower.includes("prepar") || lower.includes("serve") || lower.includes("material")) {
    return [`Preparazione per "${task.title}":`, prep, "Tieni fuori solo ciò che serve al primo passo."].join("\n");
  }
  if (lower.includes("messaggio") || lower.includes("scriv") || lower.includes("rispond")) {
    return [
      "Bozza minima:",
      "Ciao, ti rispondo ora in modo sintetico: ...",
      "Prima metti il senso. Solo dopo sistemi tono e dettagli.",
    ].join("\n");
  }
  if (lower.includes("perché") || lower.includes("prior")) {
    return [`Perché viene prima:`, ...rank.reasons.slice(0, 3)].join("\n");
  }
  return [
    `Per "${task.title}" farei così:`,
    `1. Prima: ${action}.`,
    `2. Prepara: ${prep}`,
    `3. Timer: ${minutes} minuti, poi scegli se continuare o parcheggiare.`,
    `Motivo: ${rank.reasons[0] || priorityText(rank.score).toLowerCase()}.`,
  ].join("\n");
}

function coachHistory(task) {
  return (Array.isArray(task.coachMessages) ? task.coachMessages : [])
    .filter((message) => !message.pending && message.text)
    .slice(-8)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      text: message.text,
    }));
}

function coachContext(task) {
  const rank = scoreTask(task);
  return {
    title: task.title,
    area: task.area,
    source: sourceText(task),
    status: task.status || "open",
    dueIso: task.due || "",
    dueHuman: formatTaskSchedule(task),
    durationMinutes: Number(task.duration) || 20,
    importance: Number(task.importance) || 3,
    friction: Number(task.friction) || 3,
    consequence: Number(task.consequence) || 3,
    energyRequired: Number(task.energy) || 2,
    energyToday: Number(state.prefs.energyToday) || 2,
    blocksOtherThings: Boolean(task.blocker),
    nextAction: generatedAction(task),
    missedCount: Number(task.missedCount) || 0,
    missedReason: task.missedReason || "",
    priority: {
      score: rank.score,
      label: priorityText(rank.score),
      slot: slotText(rank.slot),
      reasons: rank.reasons,
    },
  };
}

async function requestAiCoachReply(task, userText) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COACH_TIMEOUT_MS);
  const response = await fetch(COACH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      userText,
      task: coachContext(task),
      history: coachHistory(task),
    }),
  }).finally(() => clearTimeout(timeoutId));
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.message || "Coach AI non collegato");
  }
  const reply = String(data.reply || "").trim();
  if (!reply) throw new Error("Risposta vuota");
  return reply;
}

function coachErrorText(error) {
  if (error?.name === "AbortError") {
    return "L'AI ci sta mettendo troppo. Non ti lascio in attesa.";
  }
  const message = String(error?.message || "").trim();
  const lower = message.toLowerCase();
  if (lower.includes("quota") || lower.includes("limite") || lower.includes("limit") || lower.includes("429")) {
    return "L'AI è collegata, ma OpenAI sta limitando questa richiesta o la quota non è disponibile.";
  }
  if (lower.includes("chiave") || lower.includes("api key") || lower.includes("401")) {
    return "La chiave AI non è valida o va rigenerata.";
  }
  if (message) {
    return `L'AI non ha risposto: ${message}`;
  }
  return "L'AI non ha risposto. Non ti lascio bloccato.";
}

function updateSegmentState() {
  $$("[data-focus-minutes]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.focusMinutes) === Number(state.prefs.focusMinutes));
  });
  $$("[data-energy-day]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.energyDay) === Number(state.prefs.energyToday));
  });
  $$("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.prefs.filter);
  });
}

function localDateTime(dateValue, timeValue = "09:00") {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T${timeValue || "09:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function googleDate(value) {
  return String(value || "").replaceAll("-", "");
}

function googleDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    pad(date.getMinutes()),
    "00",
  ].join("");
}

function addDaysToDateValue(dateValue, days) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readTaskScheduleFields() {
  const date = els.taskCalendarDate.value;
  const allDay = els.taskAllDay.checked;
  const time = allDay ? "" : els.taskCalendarTime.value;
  const duration = Number(els.taskDuration.value) || 20;
  const start = localDateTime(date, time || "09:00");
  const repeat = els.taskRepeat.value || "none";
  const repeatUntil = repeat === "none" ? "" : els.taskRepeatUntil.value;
  const location = els.taskLocation.value.trim();
  const google = els.taskCalendarSync.checked;

  return {
    due: start ? start.toISOString() : "",
    duration,
    calendar: date || google || repeat !== "none" || location
      ? {
          google,
          date,
          time,
          allDay,
          repeat,
          repeatUntil,
          location,
        }
      : null,
  };
}

function googleRepeatRule(calendar) {
  const rules = {
    daily: "FREQ=DAILY",
    weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    weekly: "FREQ=WEEKLY",
    monthly: "FREQ=MONTHLY",
    yearly: "FREQ=YEARLY",
  };
  const base = rules[calendar?.repeat];
  if (!base) return "";
  return calendar.repeatUntil ? `${base};UNTIL=${googleDate(calendar.repeatUntil)}` : base;
}

function googleCalendarUrl(task) {
  const calendar = task.calendar;
  if (!calendar?.date) return "";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title,
    details: [
      generatedAction(task),
      task.nextAction ? `Primo passo: ${task.nextAction}` : "",
      "Creato da Questino.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  if (calendar.location) params.set("location", calendar.location);

  if (calendar.allDay) {
    params.set("dates", `${googleDate(calendar.date)}/${googleDate(addDaysToDateValue(calendar.date, 1))}`);
  } else {
    const start = localDateTime(calendar.date, calendar.time || "09:00");
    const end = new Date(start.getTime() + (Number(task.duration) || 20) * 60000);
    params.set("dates", `${googleDateTime(start)}/${googleDateTime(end)}`);
    params.set("ctz", Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome");
  }

  const repeat = googleRepeatRule(calendar);
  if (repeat) params.set("recur", `RRULE:${repeat}`);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function openGoogleCalendarDraft(task) {
  const url = googleCalendarUrl(task);
  if (!url) return false;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  showToast(opened ? "Google Calendar pronto da salvare" : "Popup bloccato: abilita le finestre per aprire Calendar");
  return Boolean(opened);
}

async function ensureGoogleCalendarAccess({ interactive = true, force = false } = {}) {
  if (!force) {
    const token = loadGoogleCalendarToken();
    if (token) return token;
  }
  if (!interactive) return "";
  if (!firebaseAuth || !googleProvider) throw new Error("Firebase non è ancora pronto");

  const user = firebaseAuth.currentUser;
  let result = null;

  if (user?.isAnonymous && user.linkWithPopup) {
    try {
      result = await user.linkWithPopup(googleProvider);
    } catch (error) {
      if (!["auth/credential-already-in-use", "auth/email-already-in-use"].includes(error.code)) throw error;
      result = await firebaseAuth.signInWithPopup(googleProvider);
    }
  } else if (user?.reauthenticateWithPopup) {
    result = await user.reauthenticateWithPopup(googleProvider);
  } else {
    result = await firebaseAuth.signInWithPopup(googleProvider);
  }

  const token = rememberGoogleCredential(result);
  if (!token) throw new Error("Permesso calendario non ricevuto");
  updateGoogleLogin(result.user || firebaseAuth.currentUser);
  return token;
}

async function googleCalendarFetch(url, { interactive = true, ...options } = {}, retry = true) {
  const token = await ensureGoogleCalendarAccess({ interactive, force: !retry });
  if (!token) throw new Error("Google Calendar non collegato");
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && retry && interactive) {
    storeGoogleCalendarToken(null);
    return googleCalendarFetch(url, { interactive, ...options }, false);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(googleCalendarApiErrorText(response.status, text));
  }

  return response.json();
}

function googleCalendarApiErrorText(status, text) {
  const lower = String(text || "").toLowerCase();
  if (status === 403 && (lower.includes("accessnotconfigured") || lower.includes("disabled"))) {
    return "Google Calendar API non è abilitata nel progetto Google Cloud.";
  }
  if (status === 403) return "Google Calendar non ha concesso il permesso richiesto.";
  if (status === 401) return "Accesso Google Calendar scaduto.";
  return `Google Calendar non ha risposto (${status}).`;
}

function taskToGoogleEventResource(task) {
  const calendar = task.calendar || {};
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome";
  const resource = {
    summary: task.title,
    description: [
      generatedAction(task),
      task.nextAction ? `Primo passo: ${task.nextAction}` : "",
      "Creato da Questino.",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  if (calendar.location) resource.location = calendar.location;

  if (calendar.allDay) {
    resource.start = { date: calendar.date };
    resource.end = { date: addDaysToDateValue(calendar.date, 1) };
  } else {
    const start = localDateTime(calendar.date, calendar.time || "09:00");
    const end = new Date(start.getTime() + (Number(task.duration) || 20) * 60000);
    resource.start = { dateTime: start.toISOString(), timeZone };
    resource.end = { dateTime: end.toISOString(), timeZone };
  }

  const repeat = googleRepeatRule(calendar);
  if (repeat) resource.recurrence = [`RRULE:${repeat}`];

  return resource;
}

async function syncTaskToGoogleCalendar(task) {
  if (!task.calendar?.google || !task.calendar.date) return false;

  try {
    const event = await googleCalendarFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify(taskToGoogleEventResource(task)),
    });
    task.calendar.eventId = event.id;
    task.calendar.htmlLink = event.htmlLink || "";
    task.externalId = `google:${event.id}`;
    task.source = "calendar";
    addHistory(`Google Calendar: ${task.title}`, "quiet");
    saveAndRender();
    showToast("Evento aggiunto a Google Calendar");
    return true;
  } catch (error) {
    showToast(`${error.message} Apro una bozza.`);
    openGoogleCalendarDraft(task);
    return false;
  }
}

function dateInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function googleEventToTask(event) {
  const allDay = Boolean(event.start?.date);
  const start = allDay ? localDateTime(event.start.date, "09:00") : new Date(event.start?.dateTime || "");
  const end = allDay ? null : new Date(event.end?.dateTime || "");
  if (!start || Number.isNaN(start.getTime())) return null;
  const duration = end && !Number.isNaN(end.getTime()) ? Math.max(5, Math.round((end - start) / 60000)) : 60;
  const date = allDay ? event.start.date : dateInputValue(start);
  const time = allDay ? "" : timeInputValue(start);

  return {
    id: uid(),
    externalId: `google:${event.id}`,
    title: event.summary || "Evento Google",
    area: "personale",
    due: start.toISOString(),
    duration,
    importance: 3,
    friction: 2,
    consequence: 3,
    energy: 2,
    blocker: false,
    nextAction: "controllo cosa richiede questo evento e preparo una cosa sola",
    status: "open",
    source: "calendar",
    calendar: {
      google: true,
      provider: "google",
      eventId: event.id,
      htmlLink: event.htmlLink || "",
      date,
      time,
      allDay,
      repeat: event.recurringEventId ? "weekly" : "none",
      repeatUntil: "",
      location: event.location || "",
    },
    createdAt: new Date().toISOString(),
  };
}

function mergeGoogleEventTask(incoming) {
  const existing = state.tasks.find((task) => task.externalId === incoming.externalId);
  if (!existing) {
    state.tasks.push(incoming);
    return "added";
  }
  if (existing.status === "done") return "kept";

  existing.title = incoming.title;
  existing.due = incoming.due;
  existing.duration = incoming.duration;
  existing.source = "calendar";
  existing.calendar = { ...(existing.calendar || {}), ...incoming.calendar };
  if (!existing.nextAction) existing.nextAction = incoming.nextAction;
  return "updated";
}

async function syncGoogleCalendar({ silent = false } = {}) {
  if (silent && !loadGoogleCalendarToken()) return;
  if (els.googleCalendarSync) {
    els.googleCalendarSync.disabled = true;
    els.googleCalendarSync.textContent = "Sync...";
  }

  try {
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(timeMin);
    timeMax.setDate(timeMax.getDate() + GOOGLE_CALENDAR_LOOKAHEAD_DAYS);

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "80");
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());

    const data = await googleCalendarFetch(url.toString(), { interactive: !silent });
    let added = 0;
    let updated = 0;

    (data.items || [])
      .filter((event) => event.status !== "cancelled")
      .map(googleEventToTask)
      .filter(Boolean)
      .forEach((task) => {
        const result = mergeGoogleEventTask(task);
        if (result === "added") added += 1;
        if (result === "updated") updated += 1;
      });

    if (added || updated) {
      addHistory(`Sync Google: ${added} nuovi, ${updated} aggiornati`, "quiet");
      saveAndRender();
    }
    if (!silent) showToast(added || updated ? `Google: ${added} nuovi, ${updated} aggiornati` : "Google Calendar già allineato");
  } catch (error) {
    if (!silent) showToast(error.message || "Sync Google non riuscito");
  } finally {
    if (els.googleCalendarSync) {
      els.googleCalendarSync.disabled = false;
      els.googleCalendarSync.innerHTML = '<svg><use href="#icon-refresh"></use></svg> Sync Google';
    }
  }
}

function startGoogleCalendarAutoSync() {
  if (calendarSyncHandle || !loadGoogleCalendarToken()) return;
  calendarSyncHandle = window.setInterval(() => {
    if (!document.hidden) syncGoogleCalendar({ silent: true });
  }, CALENDAR_SYNC_INTERVAL_MS);
}

function syncCalendarFieldState() {
  const allDay = els.taskAllDay.checked;
  els.taskCalendarTime.disabled = allDay;
  els.taskCalendarTime.closest("label")?.classList.toggle("disabled-field", allDay);

  const repeats = els.taskRepeat.value !== "none";
  els.taskRepeatUntil.disabled = !repeats;
  els.taskRepeatUntil.closest("label")?.classList.toggle("disabled-field", !repeats);
}

function createTaskFromForm(event) {
  event.preventDefault();
  const title = els.taskTitle.value.trim();
  if (!title) return;
  const schedule = readTaskScheduleFields();
  if (schedule.calendar?.google && !schedule.calendar.date) {
    showToast("Scegli un giorno per Google Calendar");
    els.taskCalendarDate.focus();
    return;
  }
  const task = {
    id: uid(),
    title,
    area: els.taskArea.value,
    due: schedule.due,
    duration: schedule.duration,
    importance: Number(els.taskImportance.value) || 3,
    friction: Number(els.taskFriction.value) || 3,
    consequence: Number(els.taskConsequence.value) || 3,
    energy: Number(els.taskEnergy.value) || 2,
    blocker: els.taskBlocker.checked,
    nextAction: els.taskAction.value.trim(),
    calendar: schedule.calendar,
    status: "open",
    source: "manual",
    createdAt: new Date().toISOString(),
  };
  state.tasks.push(task);
  addHistory(`Nuova missione: ${title}`, "quiet");
  els.taskForm.reset();
  setDefaultTaskFields();
  saveAndRender();
  if (task.calendar?.google) syncTaskToGoogleCalendar(task);
}

function setDefaultTaskFields() {
  els.taskArea.value = "personale";
  els.taskCalendarDate.value = "";
  els.taskCalendarTime.value = "";
  els.taskAllDay.checked = false;
  els.taskCalendarSync.checked = false;
  els.taskRepeat.value = "none";
  els.taskRepeatUntil.value = "";
  els.taskLocation.value = "";
  els.taskDuration.value = 20;
  els.taskImportance.value = 3;
  els.taskFriction.value = 3;
  els.taskConsequence.value = 3;
  els.taskEnergy.value = 2;
  els.taskBlocker.checked = false;
  els.taskAction.value = "";
  syncCalendarFieldState();
  $$("[data-preset]").forEach((button) => button.classList.remove("active"));
}

function applyPreset(name) {
  const presets = {
    tiny: {
      duration: 5,
      importance: 2,
      friction: 1,
      consequence: 2,
      energy: 1,
      action: "faccio solo 5 minuti, poi decido se continuare",
    },
    urgent: {
      duration: 15,
      importance: 5,
      friction: 3,
      consequence: 5,
      energy: 2,
      action: "faccio il primo passo che evita il danno peggiore",
    },
    heavy: {
      duration: 45,
      importance: 4,
      friction: 5,
      consequence: 4,
      energy: 3,
      blocker: true,
      action: "lo spezzo e apro solo il primo pezzo",
    },
    social: {
      area: "relazioni",
      duration: 10,
      importance: 3,
      friction: 3,
      consequence: 3,
      energy: 2,
      action: "scrivo una bozza imperfetta di 2 righe",
    },
  };
  const preset = presets[name];
  if (!preset) return;
  els.taskArea.value = preset.area || els.taskArea.value;
  els.taskDuration.value = preset.duration;
  els.taskImportance.value = preset.importance;
  els.taskFriction.value = preset.friction;
  els.taskConsequence.value = preset.consequence;
  els.taskEnergy.value = preset.energy;
  els.taskBlocker.checked = Boolean(preset.blocker);
  els.taskAction.value = preset.action;
  $$("[data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });
}

function setFocusMode(enabled) {
  document.body.classList.toggle("focus-mode", enabled);
  if (enabled) showToast("Modalità Focus: una cosa alla volta");
}

function applyAutopilotPlan() {
  const openTasks = rankedTasks(false).filter(({ task }) => task.status === "open");
  if (!openTasks.length) {
    showToast("Nessuna quest aperta da riorganizzare");
    return;
  }

  const capacityMinutes = Number(state.prefs.capacityHours || 4) * 60;
  const energyToday = Number(state.prefs.energyToday) || 2;
  let usedMinutes = 0;
  let kept = 0;
  let parked = 0;
  let protectedCalendar = 0;

  openTasks.forEach(({ task, rank }) => {
    const duration = Number(task.duration) || 20;
    const energyRequired = Number(task.energy) || 2;
    const energyPenalty = energyRequired > energyToday ? 1.25 : 1;
    const effectiveDuration = Math.ceil(duration * energyPenalty);
    const hours = dueHours(task);
    const fixedCalendarToday = task.source === "calendar" && hours !== null && hours <= 24;
    const urgentNow = rank.band === "now";
    const keepVisible =
      fixedCalendarToday ||
      urgentNow ||
      usedMinutes + effectiveDuration <= capacityMinutes ||
      kept === 0;

    if (keepVisible) {
      task.status = "open";
      task.autoParkedAt = null;
      usedMinutes += effectiveDuration;
      kept += 1;
      if (fixedCalendarToday) protectedCalendar += 1;
    } else {
      task.status = "parked";
      task.autoParkedAt = new Date().toISOString();
      parked += 1;
    }
  });

  const protectedText = protectedCalendar ? `, ${protectedCalendar} eventi protetti` : "";
  addHistory(`Pilota automatico: ${kept} in agenda, ${parked} in attesa${protectedText}`, "quiet");
  saveAndRender();
  showToast(parked ? `Piano pronto: ${parked} quest in attesa` : "Piano già dentro la capienza");
}

function addHydration(amount = 250) {
  const hydration = hydrationState();
  const before = hydrationProgress(hydration);
  hydration.ml = clamp((Number(hydration.ml) || 0) + amount, 0, 8000);
  hydration.lastDrinkAt = new Date().toISOString();

  award({
    xp: 2,
    coins: 0,
    text: `Benessere: +${amount} ml acqua (+2 XP)`,
  });

  const after = hydrationProgress(hydration);
  if (!before.reached && after.reached) {
    const today = todayKey();
    hydration.streak = isYesterday(hydration.lastGoalDay)
      ? (Number(hydration.streak) || 0) + 1
      : hydration.lastGoalDay === today
        ? Number(hydration.streak) || 1
        : 1;
    hydration.lastGoalDay = today;
    award({
      xp: 10,
      coins: 1,
      text: "Idratazione completata (+10 XP)",
    });
    if (hydration.streak === 7) {
      award({
        xp: 25,
        coins: 3,
        text: "Sete sotto controllo: 7 giorni (+25 XP)",
      });
    }
  }

  saveAndRender();
  showToast(after.reached ? "Idratazione fatta per oggi" : `+${amount} ml acqua · +2 XP`);
}

function resetGame() {
  const confirmed = window.confirm("Iniziare una nuova partita e cancellare le quest salvate?");
  if (!confirmed) return;
  state = defaultState();
  closeCoach();
  setDefaultTaskFields();
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  saveAndRender();
  showToast("Nuova partita pronta");
}

function startTimer() {
  const primary = primaryQuest();
  if (!primary) return;
  if (Number(state.prefs.focusMinutes) >= 45 && hydrationNeedsNudge()) {
    showToast("Sprint lungo: bevi un bicchiere prima di partire?");
  }
  state.timer.taskId = primary.task.id;
  state.timer.running = true;
  if (!state.timer.remaining || state.timer.remaining <= 0) {
    state.timer.remaining = Number(state.prefs.focusMinutes) * 60;
  }
  saveAndRender();
  ensureTimerHandle();
}

function pauseTimer() {
  state.timer.running = false;
  saveAndRender();
}

function resetTimer() {
  stopTimer(true);
  saveAndRender();
}

function stopTimer(resetRemaining) {
  state.timer.running = false;
  state.timer.taskId = null;
  if (resetRemaining) state.timer.remaining = Number(state.prefs.focusMinutes) * 60;
}

function ensureTimerHandle() {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    if (!state.timer.running) return;
    state.timer.remaining -= 1;
    if (state.timer.remaining <= 0) {
      state.timer.running = false;
      state.timer.remaining = Number(state.prefs.focusMinutes) * 60;
      const task = state.tasks.find((item) => item.id === state.timer.taskId);
      const label = task ? task.title : "Sprint";
      award({ xp: 8, coins: 1, text: `Sprint completato: ${label} (+8 XP)` });
      state.timer.taskId = null;
      chime();
      showToast(hydrationNeedsNudge() ? "Sprint completato: pausa acqua +250 ml?" : "Sprint completato: +8 XP");
    }
    saveState();
    renderTimer();
    renderProfile();
    renderHydration();
    renderLog();
  }, 1000);
}

function chime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();
    osc.frequency.value = 740;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    /* Audio can be unavailable in some browsers. */
  }
}

function importIcsFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseIcs(String(reader.result || ""));
    const tasks = parsed.filter(isUpcomingCalendarTask);
    const skippedPast = parsed.length - tasks.length;
    const existingExternalIds = new Set(state.tasks.map((task) => task.externalId).filter(Boolean));
    const fresh = tasks.filter((task) => !existingExternalIds.has(task.externalId));
    const cleaned = cleanupOldCalendarTasks();
    state.tasks.push(...fresh);
    const ignoredText = skippedPast || cleaned ? `, ${skippedPast + cleaned} vecchi ignorati` : "";
    addHistory(`Import calendario: ${fresh.length} missioni${ignoredText}`, "quiet");
    saveAndRender();
    showToast(`${fresh.length} eventi importati${ignoredText}`);
  };
  reader.readAsText(file);
}

function isUpcomingCalendarTask(task) {
  if (!task.due) return false;
  const due = new Date(task.due);
  if (Number.isNaN(due.getTime())) return false;
  return due >= startOfToday();
}

function cleanupOldCalendarTasks() {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((task) => {
    if (task.source !== "calendar" || task.status === "done") return true;
    return isUpcomingCalendarTask(task);
  });
  return before - state.tasks.length;
}

function parseIcs(text) {
  const normalized = text.replace(/\r?\n[ \t]/g, "");
  const blocks = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks
    .map((block) => {
      const summary = readIcsProp(block, "SUMMARY") || "Evento calendario";
      const startRaw = readIcsProp(block, "DTSTART");
      const endRaw = readIcsProp(block, "DTEND");
      const uidRaw = readIcsProp(block, "UID") || `${summary}-${startRaw}`;
      const start = parseIcsDate(startRaw);
      const end = parseIcsDate(endRaw);
      const duration = start && end ? clamp(Math.round((end - start) / 60000), 10, 240) : 30;
      return {
        id: uid("cal"),
        externalId: `ics:${uidRaw}`,
        title: unescapeIcs(summary),
        area: "admin",
        due: start ? start.toISOString() : "",
        duration,
        importance: 3,
        friction: 2,
        consequence: 3,
        energy: 2,
        blocker: false,
        nextAction: "Preparati e proteggi il tempo per questo evento",
        status: "open",
        source: "calendar",
        createdAt: new Date().toISOString(),
      };
    })
    .filter((task) => task.due);
}

function readIcsProp(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`^${escaped}(?:;[^:]*)?:(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

function parseIcsDate(value) {
  if (!value) return null;
  const clean = value.trim();
  if (/^\d{8}$/.test(clean)) {
    const year = Number(clean.slice(0, 4));
    const month = Number(clean.slice(4, 6)) - 1;
    const day = Number(clean.slice(6, 8));
    return new Date(year, month, day, 9, 0, 0);
  }
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  if (utc) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  }
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function unescapeIcs(value) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `progetto-adhd-backup-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      state = mergeState(defaultState(), parsed);
      addHistory("Backup importato", "quiet");
      saveAndRender();
      showToast("Backup importato");
    } catch {
      showToast("Backup non valido");
    }
  };
  reader.readAsText(file);
}

function setAvatarFromFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showToast("Scegli un'immagine");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = size;
      canvas.height = size;
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (size - width) / 2;
      const y = (size - height) / 2;
      ctx.drawImage(image, x, y, width, height);
      state.profile.avatar = canvas.toDataURL("image/jpeg", 0.86);
      saveAndRender();
      showToast("Immagine profilo aggiornata");
    };
    image.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
}

function activePrimaryId() {
  const primary = primaryQuest();
  return primary ? primary.task.id : null;
}

function shortText(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindEvents() {
  els.googleLogin?.addEventListener("click", signInWithGoogle);
  els.focusModeButton?.addEventListener("click", () => setFocusMode(true));
  els.exitFocusMode?.addEventListener("click", () => setFocusMode(false));
  els.autopilotButton?.addEventListener("click", applyAutopilotPlan);

  els.globalSearch?.addEventListener("input", () => {
    state.prefs.search = els.globalSearch.value.trim();
    saveState({ syncCloud: false });
    renderMicroLane();
    renderTasks();
  });

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      els.globalSearch?.focus();
      els.globalSearch?.select();
    }
    if (event.key === "Escape" && document.body.classList.contains("focus-mode")) {
      setFocusMode(false);
    }
  });

  els.profileName.addEventListener("change", () => {
    state.profile.name = els.profileName.value.trim();
    saveAndRender();
  });

  els.avatarButton.addEventListener("click", () => els.avatarInput.click());
  els.avatarInput.addEventListener("change", () => {
    const file = els.avatarInput.files?.[0];
    if (file) setAvatarFromFile(file);
    els.avatarInput.value = "";
  });

  els.taskForm.addEventListener("submit", createTaskFromForm);
  els.taskAllDay.addEventListener("change", syncCalendarFieldState);
  els.taskRepeat.addEventListener("change", syncCalendarFieldState);

  $$("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  els.startFocus.addEventListener("click", startTimer);
  els.pauseFocus.addEventListener("click", pauseTimer);
  els.resetFocus.addEventListener("click", resetTimer);
  els.completePrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) completeTask(id);
  });
  els.parkPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) parkTask(id);
  });
  els.missPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) missTask(id);
  });
  els.splitPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) splitTask(id);
  });
  els.coachPrimary.addEventListener("click", () => {
    const id = activePrimaryId();
    if (id) openCoach(id);
  });
  els.missionState.addEventListener("click", (event) => {
    const guide = event.target.closest("[data-guide-task-id]");
    const id = guide?.dataset.guideTaskId;
    if (id) openCoach(id);
  });

  els.microLane?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-micro-task-id]");
    const id = button?.dataset.microTaskId;
    if (id) completeTask(id);
  });

  $$("[data-focus-minutes]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.focusMinutes = Number(button.dataset.focusMinutes);
      state.timer.remaining = state.prefs.focusMinutes * 60;
      saveAndRender();
    });
  });

  $$("[data-energy-day]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.energyToday = Number(button.dataset.energyDay);
      saveAndRender();
    });
  });

  $$("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.filter = button.dataset.filter;
      saveAndRender();
    });
  });

  els.capacityHours.addEventListener("input", () => {
    state.prefs.capacityHours = Number(els.capacityHours.value);
    saveAndRender();
  });

  els.flowButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.prefs.view = button.dataset.view || "today";
      saveState({ syncCloud: false });
      renderFlowView();
    });
  });

  els.addWaterButton?.addEventListener("click", () => addHydration(250));
  els.hydrationGoal?.addEventListener("change", () => {
    const hydration = hydrationState();
    const liters = clamp(Number(els.hydrationGoal.value) || 2, 0.5, 5);
    hydration.goalMl = Math.round(liters * 1000);
    saveAndRender();
    showToast(`Obiettivo acqua: ${formatLiters(hydration.goalMl)}`);
  });

  els.taskList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest("[data-task-id]");
    const id = card?.dataset.taskId;
    if (!id) return;
    if (!button) {
      openCoach(id);
      return;
    }
    const action = button.dataset.action;
    if (action === "coach") openCoach(id);
    if (action === "done") completeTask(id);
    if (action === "miss") missTask(id);
    if (action === "park") parkTask(id);
    if (action === "delete") deleteTask(id);
    if (action === "restore") restoreTask(id);
  });

  els.taskList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-task-id]");
    const id = card?.dataset.taskId;
    if (!id) return;
    event.preventDefault();
    openCoach(id);
  });

  els.dayMap.addEventListener("click", (event) => {
    const item = event.target.closest("[data-map-task-id]");
    const id = item?.dataset.mapTaskId;
    if (id) openCoach(id);
  });

  els.icsButton.addEventListener("click", () => els.icsInput.click());
  els.icsInput.addEventListener("change", () => {
    const file = els.icsInput.files?.[0];
    if (file) importIcsFile(file);
    els.icsInput.value = "";
  });
  els.googleCalendarSync?.addEventListener("click", () => syncGoogleCalendar({ silent: false }));

  els.exportButton.addEventListener("click", exportBackup);
  els.backupButton.addEventListener("click", () => els.backupInput.click());
  els.backupInput.addEventListener("change", () => {
    const file = els.backupInput.files?.[0];
    if (file) importBackup(file);
    els.backupInput.value = "";
  });

  els.clearDone.addEventListener("click", () => {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((task) => task.status !== "done");
    addHistory(`Ripulite ${before - state.tasks.length} missioni fatte`, "quiet");
    saveAndRender();
  });

  els.newRun.addEventListener("click", resetGame);

  window.addEventListener("focus", () => {
    if (loadGoogleCalendarToken()) syncGoogleCalendar({ silent: true });
  });

  els.closeCoach.addEventListener("click", closeCoach);
  els.clearCoach.addEventListener("click", () => {
    const task = taskById(selectedCoachTaskId);
    if (!task) return;
    task.coachMessages = [];
    saveState();
    renderCoach();
  });
  els.coachBackdrop.addEventListener("click", closeCoach);
  els.coachForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = taskById(selectedCoachTaskId);
    const text = els.coachInput.value.trim();
    if (!task || !text) return;
    if ((Array.isArray(task.coachMessages) ? task.coachMessages : []).some((message) => message.pending)) {
      showToast("Il coach sta già preparando una risposta");
      return;
    }
    const pendingId = uid("coach");
    task.coachMessages = Array.isArray(task.coachMessages) ? task.coachMessages : [];
    task.coachMessages.push({ role: "user", text, at: new Date().toISOString() });
    task.coachMessages.push({
      id: pendingId,
      role: "assistant",
      mode: "ai",
      pending: true,
      text: "Sto leggendo la quest e preparo una risposta precisa...",
      at: new Date().toISOString(),
    });
    task.coachMessages = task.coachMessages.slice(-COACH_HISTORY_LIMIT);
    task.aiFallback = false;
    els.coachInput.value = "";
    if (els.coachSend) els.coachSend.disabled = true;
    saveState();
    renderCoach();

    try {
      const reply = await requestAiCoachReply(task, text);
      const freshTask = taskById(task.id);
      if (!freshTask) return;
      const pending = freshTask.coachMessages.find((message) => message.id === pendingId);
      if (pending) {
        pending.text = reply;
        pending.pending = false;
        pending.mode = "ai";
      }
      freshTask.aiFallback = false;
      coachAiReady = true;
    } catch (error) {
      const freshTask = taskById(task.id);
      if (!freshTask) return;
      const pending = freshTask.coachMessages.find((message) => message.id === pendingId);
      if (pending) {
        pending.text = `${coachErrorText(error)}\n\nGuida immediata:\n${coachReply(freshTask, text)}`;
        pending.pending = false;
        pending.mode = "offline";
      }
      freshTask.aiFallback = true;
      coachAiReady = false;
      showToast("Risposta AI non disponibile: uso guida locale");
    } finally {
      if (els.coachSend) els.coachSend.disabled = false;
      saveState();
      if (selectedCoachTaskId === task.id) renderCoach();
    }
  });

  els.noReason.addEventListener("change", renderNoScript);
  els.copyNo.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.noScript.value);
      showToast("Testo copiato");
    } catch {
      els.noScript.select();
      document.execCommand("copy");
      showToast("Testo copiato");
    }
  });

  els.scoreNo.addEventListener("click", () => {
    award({ xp: 25, coins: 4, text: "Allenamento del no completato (+25 XP)" });
    saveAndRender();
    showToast("+25 XP per aver protetto la capienza");
  });

  els.rewardGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-theme-choice]");
    if (!card) return;
    const theme = card.dataset.themeChoice;
    if (!theme) return;
    state.profile.theme = state.profile.theme === theme ? "default" : theme;
    saveAndRender();
  });
}

function setupStarfield() {
  const canvas = els.starfield;
  const ctx = canvas.getContext("2d");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(130, Math.max(55, Math.floor(window.innerWidth / 10)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 0.28 + 0.04,
      hue: ["#39e89a", "#ffd166", "#ff4f86", "#68a9ff"][Math.floor(Math.random() * 4)],
    }));
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    stars.forEach((star) => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = star.hue;
      ctx.globalAlpha = 0.35 + star.size * 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!prefersReduced) {
        star.y += star.speed;
        if (star.y > window.innerHeight + 4) {
          star.y = -4;
          star.x = Math.random() * window.innerWidth;
        }
      }
    });
    if (!prefersReduced) requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
}

bindEvents();
setDefaultTaskFields();
cleanupOldCalendarTasks();
render();
initFirebaseSync();
startGoogleCalendarAutoSync();
setupStarfield();
ensureTimerHandle();
