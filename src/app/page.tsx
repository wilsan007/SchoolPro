import Link from "next/link";
import { School, CheckCircle, ArrowRight, Users, BookOpen, ClipboardList, BarChart3, Shield, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <School className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold">EcolPro</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/70">
            <a href="#fonctionnalites" className="hover:text-white transition-colors">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-white transition-colors">Tarifs</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="text-white/80 hover:text-white hover:bg-white/10">
              <Link href="/login">Connexion</Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/register">Essai gratuit</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
          <Globe className="h-4 w-4" />
          Plateforme SaaS multi-tenant — 12 pays d'Afrique
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6 bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-transparent">
          La gestion scolaire<br />réinventée
        </h1>
        <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          EcolPro unifie élèves, absences, notes, parents et examens dans une seule plateforme moderne, sécurisée et accessible partout en Afrique.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="bg-primary hover:bg-primary/90 h-12 px-8 text-base gap-2">
            <Link href="/register">
              Démarrer gratuitement — 30 jours
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/20 bg-transparent text-white hover:bg-white/10 h-12 px-8 text-base">
            <Link href="/login">Voir la démo live</Link>
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/10 bg-white/5">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: "Établissements actifs", value: "500+" },
            { label: "Élèves gérés", value: "120 000+" },
            { label: "Notes saisies", value: "2M+" },
            { label: "Uptime garanti", value: "99.9%" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-extrabold text-primary">{stat.value}</p>
              <p className="text-sm text-white/50 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Tout ce dont votre école a besoin</h2>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            12 modules intégrés, pensés pour les réalités africaines
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Users, title: "Gestion des Élèves", desc: "Dossiers numériques complets, inscriptions en ligne, matricules automatiques, historique de scolarité.", color: "text-violet-400" },
            { icon: ClipboardList, title: "Absences & Présences", desc: "Appel numérique en 30 secondes, notification SMS/WhatsApp aux parents, statistiques d'assiduité.", color: "text-orange-400" },
            { icon: BookOpen, title: "Notes & Bulletins", desc: "Saisie rapide, calcul automatique des moyennes, bulletins PDF professionnels générés en 1 clic.", color: "text-green-400" },
            { icon: BarChart3, title: "Analytics & IA", desc: "Détection précoce du décrochage scolaire, prédiction des résultats, rapports exécutifs automatisés.", color: "text-blue-400" },
            { icon: Shield, title: "Sécurité Enterprise", desc: "Chiffrement AES-256, MFA, RGPD, audit log complet, SLA 99.9% garanti contractuellement.", color: "text-red-400" },
            { icon: Globe, title: "Multi-tenant & Multi-pays", desc: "Chaque établissement a son espace isolé. Support XOF, GNF, MAD. Wave et Orange Money intégrés.", color: "text-cyan-400" },
          ].map((feature) => (
            <div key={feature.title} className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group">
              <div className={`w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
              </div>
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tarifs */}
      <section id="tarifs" className="bg-white/5 border-y border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Tarifs simples et transparents</h2>
            <p className="text-white/50 text-lg">Sans engagement, sans surprise</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { name: "Starter", price: "49", eleves: "< 200 élèves", features: ["Modules de base", "App mobile parents", "Support email", "1 utilisateur admin"] },
              { name: "Pro", price: "149", eleves: "200 – 1 000 élèves", features: ["Tous les modules", "App mobile complète", "Support prioritaire", "10 utilisateurs", "Exports PDF/Excel"], popular: true },
              { name: "Business", price: "399", eleves: "1 000 – 5 000 élèves", features: ["Multi-campus", "Analytics avancés", "SSO SAML", "Utilisateurs illimités", "API complète"] },
              { name: "Enterprise", price: "Sur devis", eleves: "> 5 000 élèves", features: ["On-premise possible", "SLA 99.9% garanti", "Formation incluse", "Intégrations custom", "Account manager"] },
            ].map((plan) => (
              <div key={plan.name} className={`p-6 rounded-2xl border transition-all ${plan.popular ? "border-primary bg-primary/10 scale-105" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                {plan.popular && (
                  <div className="text-xs font-bold text-primary bg-primary/20 px-3 py-1 rounded-full inline-block mb-4">
                    LE PLUS POPULAIRE
                  </div>
                )}
                <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
                <p className="text-white/50 text-sm mb-4">{plan.eleves}</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  {plan.price !== "Sur devis" && <span className="text-white/50">€/mois</span>}
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className={`w-full ${plan.popular ? "bg-primary hover:bg-primary/90" : "bg-white/10 hover:bg-white/20 text-white"}`}
                  variant={plan.popular ? "default" : "outline"}
                >
                  <Link href="/register">Commencer</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h2 className="text-4xl font-bold mb-4">Prêt à moderniser votre école ?</h2>
        <p className="text-white/50 mb-8 text-lg">30 jours gratuits. Aucune carte bancaire requise.</p>
        <Button asChild size="lg" className="bg-primary hover:bg-primary/90 h-12 px-10 text-base gap-2">
          <Link href="/register">
            Créer mon espace gratuitement
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <School className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold">EcolPro</span>
          </div>
          <p className="text-sm text-white/40">
            © {new Date().getFullYear()} EcolPro. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
