/**
 * Test script: messagerie + notification d'absence
 * Run: node tests/test-messaging.js
 */
const BASE = "http://localhost:3002";

async function main() {
  console.log("=== Test Messagerie & Notifications ===\n");

  // 1. Login as admin
  console.log("1. Login admin...");
  const loginRes = await fetch(`${BASE}/api/auth/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@lycee-demo.ecolpro.app",
      password: "Demo@2026!",
    }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error("   ECHEC login admin:", loginData.error);
    process.exit(1);
  }
  const adminToken = loginData.token;
  const adminId = loginData.user.id;
  console.log("   OK - Admin:", loginData.user.name, "ID:", adminId);

  // 2. Login as teacher
  console.log("\n2. Login enseignant...");
  const teacherLogin = await fetch(`${BASE}/api/auth/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "enseignant@lycee-demo.ecolpro.app",
      password: "Demo@2026!",
    }),
  });
  const teacherData = await teacherLogin.json();
  if (!teacherLogin.ok) {
    console.error("   ECHEC login enseignant:", teacherData.error);
    process.exit(1);
  }
  const teacherId = teacherData.user.id;
  console.log("   OK - Enseignant:", teacherData.user.name, "ID:", teacherId);

  // 3. Login as parent
  console.log("\n3. Login parent...");
  const parentLogin = await fetch(`${BASE}/api/auth/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "parent@lycee-demo.ecolpro.app",
      password: "Demo@2026!",
    }),
  });
  const parentData = await parentLogin.json();
  if (!parentLogin.ok) {
    console.error("   ECHEC login parent:", parentData.error);
    process.exit(1);
  }
  const parentId = parentData.user.id;
  console.log("   OK - Parent:", parentData.user.name, "ID:", parentId);

  // 4. Get classes (for appel)
  console.log("\n4. Recuperation classes (mobile)...");
  const classesRes = await fetch(`${BASE}/api/mobile/classes`, {
    headers: { Authorization: `Bearer ${teacherData.token}` },
  });
  const classesData = await classesRes.json();
  if (!classesRes.ok) {
    console.error("   ECHEC classes:", classesData.error);
  } else {
    console.log("   OK - Classes:", classesData.classes?.length ?? 0);
    if (classesData.classes?.length > 0) {
      const classe = classesData.classes[0];
      console.log("   Premiere classe:", classe.nom, "eleves:", classe.eleves?.length);

      // 5. Faire l'appel - marquer le premier eleve absent
      console.log("\n5. Test appel (notification absence)...");
      const eleves = classe.eleves ?? [];
      if (eleves.length > 0) {
        const presences = {};
        eleves.forEach((e) => (presences[e.id] = "present"));
        presences[eleves[0].id] = "absent"; // Marquer le premier absent

        const appelRes = await fetch(`${BASE}/api/mobile/appel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${teacherData.token}`,
          },
          body: JSON.stringify({
            classeId: classe.id,
            presences,
            date: new Date().toISOString(),
          }),
        });
        const appelData = await appelRes.json();
        if (!appelRes.ok) {
          console.error("   ECHEC appel:", appelData.error);
        } else {
          console.log("   OK - Absences creees:", appelData.absencesCreees);
          console.log("   OK - Notifications envoyees:", appelData.notificationsEnvoyees);
        }
      }
    }
  }

  // 6. Test communication (notification generale)
  console.log("\n6. Test communication (notification IN_APP)...");
  // Need NextAuth session for /api/communication - use cookie-based auth
  // We'll test via the mobile route instead
  console.log("   (Route web necessite session NextAuth - skip, test via navigateur)");

  // 7. Test messagerie mobile
  console.log("\n7. Test messagerie mobile (parent)...");
  const msgRes = await fetch(`${BASE}/api/mobile/messages`, {
    headers: { Authorization: `Bearer ${parentData.token}` },
  });
  const msgData = await msgRes.json();
  if (!msgRes.ok) {
    console.error("   ECHEC messages:", msgData.error);
  } else {
    console.log("   OK - Conversations:", msgData.conversations?.length ?? 0);
    console.log("   OK - Non lus:", msgData.nonLus ?? 0);
  }

  // 8. Test messagerie mobile (enseignant)
  console.log("\n8. Test messagerie mobile (enseignant)...");
  const teacherMsgRes = await fetch(`${BASE}/api/mobile/messages`, {
    headers: { Authorization: `Bearer ${teacherData.token}` },
  });
  const teacherMsgData = await teacherMsgRes.json();
  if (!teacherMsgRes.ok) {
    console.error("   ECHEC messages enseignant:", teacherMsgData.error);
  } else {
    console.log("   OK - Conversations:", teacherMsgData.conversations?.length ?? 0);
  }

  // 9. Test analytics mobile
  console.log("\n9. Test analytics mobile...");
  const analyticsRes = await fetch(`${BASE}/api/mobile/analytics`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const analyticsData = await analyticsRes.json();
  if (!analyticsRes.ok) {
    console.error("   ECHEC analytics:", analyticsData.error);
  } else {
    console.log("   OK - Eleves:", analyticsData.stats?.totalEleves);
    console.log("   OK - Classes:", analyticsData.stats?.totalClasses);
    console.log("   OK - Absences:", analyticsData.stats?.totalAbsences);
  }

  // 10. Test absences mobile (parent)
  console.log("\n10. Test absences mobile (parent)...");
  const absRes = await fetch(`${BASE}/api/mobile/absences`, {
    headers: { Authorization: `Bearer ${parentData.token}` },
  });
  const absData = await absRes.json();
  if (!absRes.ok) {
    console.error("   ECHEC absences:", absData.error);
  } else {
    console.log("   OK - Absences:", absData.absences?.length ?? 0);
    console.log("   OK - Stats:", JSON.stringify(absData.stats));
  }

  console.log("\n=== Tests termines ===");
}

main().catch((e) => {
  console.error("Erreur fatale:", e);
  process.exit(1);
});
