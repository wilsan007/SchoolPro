/**
 * Système de traduction léger pour l'app mobile Expo.
 *
 * Pas de dépendance externe — un simple dictionnaire par locale.
 * La locale est stockée dans SecureStore et persistée entre les sessions.
 * Par défaut : français (langue principale du projet).
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const LOCALE_KEY = "ecolpro_locale";

export type Locale = "fr" | "en" | "so";

// ─── Dictionnaires ──────────────────────────────────────────────────────────

const fr: Record<string, string> = {
  // Common
  "common.loading": "Chargement...",
  "common.error": "Erreur",
  "common.retry": "Réessayer",
  "common.cancel": "Annuler",
  "common.confirm": "Confirmer",
  "common.save": "Enregistrer",
  "common.delete": "Supprimer",
  "common.close": "Fermer",
  "common.search": "Rechercher",
  "common.all": "Tous",
  "common.none": "Aucun",
  "common.yes": "Oui",
  "common.no": "Non",
  "common.back": "Retour",
  "common.language": "Langue",

  // Login
  "login.title": "Connexion",
  "login.email": "Adresse email",
  "login.password": "Mot de passe",
  "login.submit": "Se connecter",
  "login.demoAccounts": "Comptes de démonstration",
  "login.fillFields": "Veuillez remplir tous les champs",
  "login.error": "Erreur de connexion",
  "login.2faTitle": "Code de vérification (2FA)",
  "login.2faHint": "Saisissez le code à 6 chiffres de votre application d'authentification, ou un code de secours (format XXXX-XXXX).",
  "login.2faPlaceholder": "123456",
  "login.2faVerify": "Vérifier",
  "login.2faInvalid": "Code de vérification invalide",

  // Tabs
  "tab.dashboard": "Accueil",
  "tab.eleves": "Élèves",
  "tab.notes": "Notes",
  "tab.absences": "Absences",
  "tab.plus": "Plus",
  "tab.profile": "Profil",

  // Dashboard
  "dashboard.hello": "Bonjour",
  "dashboard.activeStudents": "Élèves actifs",
  "dashboard.absencesToday": "Absences aujourd'hui",
  "dashboard.notesEntered": "Notes saisies",
  "dashboard.classes": "Classes",
  "dashboard.recentAbsences": "Absences récentes",
  "dashboard.recentNotes": "Dernières notes",
  "dashboard.upcomingExams": "Prochains examens",
  "dashboard.quickAccess": "Accès rapide",
  "dashboard.timetable": "Emploi du temps",
  "dashboard.vieScolaire": "Vie scolaire",
  "dashboard.messages": "Messages",
  "dashboard.analytics": "Analytics",
  "dashboard.noAbsences": "Aucune absence récente",
  "dashboard.noNotes": "Aucune note récente",
  "dashboard.noExams": "Aucun examen planifié",
  "dashboard.seeAll": "Voir tout",

  // Absences
  "absence.absent": "Absent",
  "absence.late": "Retard",
  "absence.justified": "JUSTIFIEE",
  "absence.unjustified": "INJUSTIFIEE",
  "absence.pending": "EN ATTENTE",

  // Profile
  "profile.title": "Profil",
  "profile.personalInfo": "Informations personnelles",
  "profile.notifications": "Notifications",
  "profile.security": "Sécurité",
  "profile.settings": "Paramètres de l'application",
  "profile.help": "Aide & Support",
  "profile.logout": "Se déconnecter",
  "profile.logoutConfirm": "Voulez-vous vraiment vous déconnecter ?",
  "profile.logoutButton": "Déconnecter",
  "profile.language": "Langue",
  "profile.timeMachine": "Time Machine",
  "profile.timeMachineDesc": "Simuler une date pour les démonstrations",
  "profile.timeMachineEnabled": "Activée",
  "profile.timeMachineDisabled": "Désactivée",
  "profile.timeMachineSet": "Définir la date",
  "profile.timeMachineClear": "Revenir à l'heure réelle",
  "profile.timeMachineCurrent": "Date simulée",

  // Plus
  "plus.title": "Toutes les fonctions",
  "plus.subtitle": "Plus de modules",
  "plus.appel": "Faire l'appel",
  "plus.appelDesc": "Saisir les présences en classe",
  "plus.timetable": "Emploi du temps",
  "plus.timetableDesc": "Planning des cours et salles",
  "plus.vieScolaire": "Vie scolaire",
  "plus.vieScolaireDesc": "Incidents et sanctions",
  "plus.messages": "Messages",
  "plus.messagesDesc": "Communications avec parents",
  "plus.analytics": "Analytics",
  "plus.analyticsDesc": "Statistiques et rapports",
  "plus.cahierJournal": "Cahier journal",
  "plus.cahierJournalDesc": "Séances pédagogiques",
  "plus.recommandations": "Recommandations",
  "plus.recommandationsDesc": "Intelligence pédagogique LEARNOS",
  "plus.reinscription": "Réinscription",
  "plus.reinscriptionDesc": "Campagne de réinscription",

  // Cahier journal
  "cahierJournal.title": "Cahier Journal",
  "cahierJournal.noSeances": "Aucune séance trouvée",
  "cahierJournal.status": "Statut",
  "cahierJournal.content": "Contenu",
  "cahierJournal.week": "Semaine",
  "cahierJournal.duration": "Durée",
  "cahierJournal.present": "Présents",
  "cahierJournal.absent": "Absents",
  "cahierJournal.statusPLANIFIEE": "Planifiée",
  "cahierJournal.statusEFFECTUEE": "Effectuée",
  "cahierJournal.statusANNULEE": "Annulée",
  "cahierJournal.statusREPORTEE": "Reportée",

  // Recommandations
  "recommandations.title": "Recommandations",
  "recommandations.noData": "Aucune recommandation",
  "recommandations.priority": "Priorité",
  "recommandations.justification": "Justification",
  "recommandations.action": "Action suggérée",
  "recommandations.student": "Élève",
  "recommandations.class": "Classe",
  "recommandations.competence": "Compétence",

  // Reinscription
  "reinscription.title": "Réinscription",
  "reinscription.noInvitations": "Aucune invitation de réinscription",
  "reinscription.confirm": "Confirmer la réinscription",
  "reinscription.refuse": "Refuser",
  "reinscription.confirmQuestion": "Confirmer la réinscription de {name} ?",
  "reinscription.refuseQuestion": "Refuser la réinscription de {name} ?",
  "reinscription.confirmed": "Réinscription confirmée. Merci !",
  "reinscription.refused": "Réinscription refusée.",
  "reinscription.campaign": "Campagne",
  "reinscription.students": "Élèves",
  "reinscription.reinscrits": "Réinscrits",
  "reinscription.nonReinscrits": "Non réinscrits",
  "reinscription.statusINVITE": "Invité",
  "reinscription.statusCONFIRME": "Confirmé",
  "reinscription.statusREFUSE": "Refusé",
  "reinscription.statusSANS_REPONSE": "Sans réponse",

  // Classes hierarchy
  "classes.primaire": "Primaire",
  "classes.college": "Collège",
  "classes.lycee": "Lycée",
  "classes.autre": "Autre",
  "classes.students": "élèves",
};

const en: Record<string, string> = {
  // Common
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.retry": "Retry",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.close": "Close",
  "common.search": "Search",
  "common.all": "All",
  "common.none": "None",
  "common.yes": "Yes",
  "common.no": "No",
  "common.back": "Back",
  "common.language": "Language",

  // Login
  "login.title": "Login",
  "login.email": "Email address",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.demoAccounts": "Demo accounts",
  "login.fillFields": "Please fill in all fields",
  "login.error": "Login error",
  "login.2faTitle": "Verification code (2FA)",
  "login.2faHint": "Enter the 6-digit code from your authenticator app, or a backup code (XXXX-XXXX format).",
  "login.2faPlaceholder": "123456",
  "login.2faVerify": "Verify",
  "login.2faInvalid": "Invalid verification code",

  // Tabs
  "tab.dashboard": "Home",
  "tab.eleves": "Students",
  "tab.notes": "Grades",
  "tab.absences": "Absences",
  "tab.plus": "More",
  "tab.profile": "Profile",

  // Dashboard
  "dashboard.hello": "Hello",
  "dashboard.activeStudents": "Active students",
  "dashboard.absencesToday": "Absences today",
  "dashboard.notesEntered": "Grades entered",
  "dashboard.classes": "Classes",
  "dashboard.recentAbsences": "Recent absences",
  "dashboard.recentNotes": "Recent grades",
  "dashboard.upcomingExams": "Upcoming exams",
  "dashboard.quickAccess": "Quick access",
  "dashboard.timetable": "Timetable",
  "dashboard.vieScolaire": "School life",
  "dashboard.messages": "Messages",
  "dashboard.analytics": "Analytics",
  "dashboard.noAbsences": "No recent absences",
  "dashboard.noNotes": "No recent grades",
  "dashboard.noExams": "No exams scheduled",
  "dashboard.seeAll": "See all",

  // Absences
  "absence.absent": "Absent",
  "absence.late": "Late",
  "absence.justified": "JUSTIFIED",
  "absence.unjustified": "UNJUSTIFIED",
  "absence.pending": "PENDING",

  // Profile
  "profile.title": "Profile",
  "profile.personalInfo": "Personal information",
  "profile.notifications": "Notifications",
  "profile.security": "Security",
  "profile.settings": "App settings",
  "profile.help": "Help & Support",
  "profile.logout": "Sign out",
  "profile.logoutConfirm": "Do you really want to sign out?",
  "profile.logoutButton": "Sign out",
  "profile.language": "Language",
  "profile.timeMachine": "Time Machine",
  "profile.timeMachineDesc": "Simulate a date for demos",
  "profile.timeMachineEnabled": "Enabled",
  "profile.timeMachineDisabled": "Disabled",
  "profile.timeMachineSet": "Set date",
  "profile.timeMachineClear": "Return to real time",
  "profile.timeMachineCurrent": "Simulated date",

  // Plus
  "plus.title": "All functions",
  "plus.subtitle": "More modules",
  "plus.appel": "Take attendance",
  "plus.appelDesc": "Enter classroom attendance",
  "plus.timetable": "Timetable",
  "plus.timetableDesc": "Class and room schedule",
  "plus.vieScolaire": "School life",
  "plus.vieScolaireDesc": "Incidents and sanctions",
  "plus.messages": "Messages",
  "plus.messagesDesc": "Parent communications",
  "plus.analytics": "Analytics",
  "plus.analyticsDesc": "Statistics and reports",
  "plus.cahierJournal": "Lesson journal",
  "plus.cahierJournalDesc": "Teaching sessions",
  "plus.recommandations": "Recommendations",
  "plus.recommandationsDesc": "LEARNOS pedagogical intelligence",
  "plus.reinscription": "Re-enrollment",
  "plus.reinscriptionDesc": "Re-enrollment campaign",

  // Cahier journal
  "cahierJournal.title": "Lesson Journal",
  "cahierJournal.noSeances": "No sessions found",
  "cahierJournal.status": "Status",
  "cahierJournal.content": "Content",
  "cahierJournal.week": "Week",
  "cahierJournal.duration": "Duration",
  "cahierJournal.present": "Present",
  "cahierJournal.absent": "Absent",
  "cahierJournal.statusPLANIFIEE": "Planned",
  "cahierJournal.statusEFFECTUEE": "Completed",
  "cahierJournal.statusANNULEE": "Cancelled",
  "cahierJournal.statusREPORTEE": "Postponed",

  // Recommandations
  "recommandations.title": "Recommendations",
  "recommandations.noData": "No recommendations",
  "recommandations.priority": "Priority",
  "recommandations.justification": "Justification",
  "recommandations.action": "Suggested action",
  "recommandations.student": "Student",
  "recommandations.class": "Class",
  "recommandations.competence": "Competency",

  // Reinscription
  "reinscription.title": "Re-enrollment",
  "reinscription.noInvitations": "No re-enrollment invitations",
  "reinscription.confirm": "Confirm re-enrollment",
  "reinscription.refuse": "Decline",
  "reinscription.confirmQuestion": "Confirm re-enrollment of {name}?",
  "reinscription.refuseQuestion": "Decline re-enrollment of {name}?",
  "reinscription.confirmed": "Re-enrollment confirmed. Thank you!",
  "reinscription.refused": "Re-enrollment declined.",
  "reinscription.campaign": "Campaign",
  "reinscription.students": "Students",
  "reinscription.reinscrits": "Re-enrolled",
  "reinscription.nonReinscrits": "Not re-enrolled",
  "reinscription.statusINVITE": "Invited",
  "reinscription.statusCONFIRME": "Confirmed",
  "reinscription.statusREFUSE": "Declined",
  "reinscription.statusSANS_REPONSE": "No response",

  // Classes hierarchy
  "classes.primaire": "Primary",
  "classes.college": "Middle School",
  "classes.lycee": "High School",
  "classes.autre": "Other",
  "classes.students": "students",
};

const so: Record<string, string> = {
  // Common
  "common.loading": "Socda...",
  "common.error": "Khalad",
  "common.retry": "Dib u dayi",
  "common.cancel": "Jooji",
  "common.confirm": "Xaqiiji",
  "common.save": "Kaydi",
  "common.delete": "Tirtir",
  "common.close": "Xidh",
  "common.search": "Raadi",
  "common.all": "Dhammaan",
  "common.none": "Midna",
  "common.yes": "Haa",
  "common.no": "Maya",
  "common.back": "Dib",
  "common.language": "Luqad",

  // Login
  "login.title": "Galitaanka",
  "login.email": "Ciwaanka iimaylka",
  "login.password": "Erayga sirta",
  "login.submit": "Soo gal",
  "login.demoAccounts": "Akoonada tijaabada",
  "login.fillFields": "Fadlan buuxi dhammaan beeraha",
  "login.error": "Khalad galitaanka",
  "login.2faTitle": "Koodka xaqiijinta (2FA)",
  "login.2faHint": "Geli koodka 6-ramo ee app-kaaga, ama koodka backup (qaab XXXX-XXXX).",
  "login.2faPlaceholder": "123456",
  "login.2faVerify": "Xaqiiji",
  "login.2faInvalid": "Koodka xaqiijinta khaldan",

  // Tabs
  "tab.dashboard": "Hore",
  "tab.eleves": "Ardayda",
  "tab.notes": "Dhibco",
  "tab.absences": "Maqnaansho",
  "tab.plus": "Waxyaabo kale",
  "tab.profile": "Profiilka",

  // Dashboard
  "dashboard.hello": "Salaan",
  "dashboard.activeStudents": "Arday firfircoon",
  "dashboard.absencesToday": "Maqnaansho maanta",
  "dashboard.notesEntered": "Dhibco la geliyay",
  "dashboard.classes": "Fasasyada",
  "dashboard.recentAbsences": "Maqnaansho dhawaan",
  "dashboard.recentNotes": "Dhibco dambe",
  "dashboard.upcomingExams": "Imtixaanada soo socda",
  "dashboard.quickAccess": "Galitaanka degdeg",
  "dashboard.timetable": "Jadwalka",
  "dashboard.vieScolaire": "Nolosha dugsiga",
  "dashboard.messages": "Fariimaha",
  "dashboard.analytics": "Tirakoob",
  "dashboard.noAbsences": "Maqnaansho dhawaan ma jiro",
  "dashboard.noNotes": "Dhibco dambe ma jiro",
  "dashboard.noExams": "Imtixaan la qorsheeyay ma jiro",
  "dashboard.seeAll": "Eeg dhammaan",

  // Absences
  "absence.absent": "Maqan",
  "absence.late": "Daahyur",
  "absence.justified": "SHARCIYEYSAN",
  "absence.unjustified": "ANSHARAXNEYN",
  "absence.pending": "SUGAYNAYA",

  // Profile
  "profile.title": "Profiilka",
  "profile.personalInfo": "Macluumaadka shakhsiga",
  "profile.notifications": "Ogeysiisyada",
  "profile.security": "Amniga",
  "profile.settings": "Dejinta app-ka",
  "profile.help": "Caawima & Taageero",
  "profile.logout": "Ka bax",
  "profile.logoutConfirm": "Ma rabtaa inaad ka baxdo?",
  "profile.logoutButton": "Ka bax",
  "profile.language": "Luqad",
  "profile.timeMachine": "Mashiinka Waqtiga",
  "profile.timeMachineDesc": "Taariikh dhaldhig ah oo lagu sameynayo tijaabooyin",
  "profile.timeMachineEnabled": "Shaqeysa",
  "profile.timeMachineDisabled": "Xidhan",
  "profile.timeMachineSet": "Deji taariikhda",
  "profile.timeMachineClear": "Ku noqod waqtiga dhabta ah",
  "profile.timeMachineCurrent": "Taariikhda la dhaldhigay",

  // Plus
  "plus.title": "Dhammaan hawlaha",
  "plus.subtitle": "Moodooyin kale",
  "plus.appel": "Galitaanka maqnaansho",
  "plus.appelDesc": "Geli maqnaanshaha fasalka",
  "plus.timetable": "Jadwalka",
  "plus.timetableDesc": "Qoritaanka casharada iyo qolalka",
  "plus.vieScolaire": "Nolosha dugsiga",
  "plus.vieScolaireDesc": "Dhibaatooyinka iyo ciqaabaha",
  "plus.messages": "Fariimaha",
  "plus.messagesDesc": "Isgaarsiinta waalidiinta",
  "plus.analytics": "Tirakoob",
  "plus.analyticsDesc": "Tirakoob iyo warbixino",
  "plus.cahierJournal": "Buugga casharka",
  "plus.cahierJournalDesc": "Casharada waxbarashada",
  "plus.recommandations": "Talooyinka",
  "plus.recommandationsDesc": "Caqliga waxbarashada LEARNOS",
  "plus.reinscription": "Dib u qorista",
  "plus.reinscriptionDesc": "Ololaaha dib u qorista",

  // Cahier journal
  "cahierJournal.title": "Buugga Casharka",
  "cahierJournal.noSeances": "Cashar lama helin",
  "cahierJournal.status": "Xaalad",
  "cahierJournal.content": "Waxa ku jira",
  "cahierJournal.week": "Toddobaad",
  "cahierJournal.duration": "Muddada",
  "cahierJournal.present": "Jooga",
  "cahierJournal.absent": "Maqan",
  "cahierJournal.statusPLANIFIEE": "La qorsheeyay",
  "cahierJournal.statusEFFECTUEE": "La sameeyay",
  "cahierJournal.statusANNULEE": "La joojiyay",
  "cahierJournal.statusREPORTEE": "La dib dhigay",

  // Recommandations
  "recommandations.title": "Talooyinka",
  "recommandations.noData": "Talo lama helin",
  "recommandations.priority": "Mudnaanta",
  "recommandations.justification": "Sababta",
  "recommandations.action": "Haw lagu talinayo",
  "recommandations.student": "Arday",
  "recommandations.class": "Fasal",
  "recommandations.competence": "Xirfad",

  // Reinscription
  "reinscription.title": "Dib u qorista",
  "reinscription.noInvitations": "Casriyo dib u qoris ah ma jiro",
  "reinscription.confirm": "Xaqiiji dib u qorista",
  "reinscription.refuse": "Diid",
  "reinscription.confirmQuestion": "Xaqiiji dib u qorista {name}?",
  "reinscription.refuseQuestion": "Diid dib u qorista {name}?",
  "reinscription.confirmed": "Dib u qorista waa la xaqiijiyay. Mahadsanid!",
  "reinscription.refused": "Dib u qorista waa la diiday.",
  "reinscription.campaign": "Ololaha",
  "reinscription.students": "Ardayda",
  "reinscription.reinscrits": "Dib u qoran",
  "reinscription.nonReinscrits": "Aan dib u qoran",
  "reinscription.statusINVITE": "La casriyay",
  "reinscription.statusCONFIRME": "La xaqiijiyay",
  "reinscription.statusREFUSE": "La diiday",
  "reinscription.statusSANS_REPONSE": "Jawaab la'aan",

  // Classes hierarchy
  "classes.primaire": "Dugsiga Hoose",
  "classes.college": "Dugsiga Dhexe",
  "classes.lycee": "Dugsiga Sare",
  "classes.autre": "Kale",
  "classes.students": "arday",
};

const dictionaries: Record<Locale, Record<string, string>> = { fr, en, so };

// ─── Gestion de la locale ────────────────────────────────────────────────────

let currentLocale: Locale = "fr";

export async function initLocale(): Promise<void> {
  try {
    const stored = Platform.OS === "web"
      ? localStorage.getItem(LOCALE_KEY)
      : await SecureStore.getItemAsync(LOCALE_KEY);
    if (stored && ["fr", "en", "so"].includes(stored)) {
      currentLocale = stored as Locale;
    }
  } catch {
    // Garder la valeur par défaut (fr)
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export async function setLocale(locale: Locale): Promise<void> {
  currentLocale = locale;
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(LOCALE_KEY, locale);
    } else {
      await SecureStore.setItemAsync(LOCALE_KEY, locale);
    }
  } catch {
    // Non bloquant
  }
}

/**
 * Traduit une clé. Si la clé n'existe pas, retourne la clé elle-même.
 *
 * Usage : t("dashboard.hello")
 * Avec interpolation : t("reinscription.confirmQuestion", { name: "Ahmed" })
 */
export function t(key: string, params?: Record<string, string>): string {
  let value = dictionaries[currentLocale]?.[key] ?? dictionaries.fr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, v);
    }
  }
  return value;
}
