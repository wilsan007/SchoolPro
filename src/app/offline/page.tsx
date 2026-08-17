"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Vous êtes hors ligne</h1>
        <p className="text-gray-500 mb-6">
          EcolPro nécessite une connexion internet pour fonctionner pleinement.
          Certaines données récentes pourraient ne pas être disponibles.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
        >
          Réessayer
        </button>
        <p className="text-xs text-gray-400 mt-6">
          EcolPro · Gestion scolaire pour l&apos;Afrique
        </p>
      </div>
    </div>
  );
}
