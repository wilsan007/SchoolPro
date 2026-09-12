/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // Pas d'imports circulaire
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Les dépendances circulaires causent des bugs subtils',
      from: {},
      to: { circular: true },
    },
    // Pas d'import de src/app dans src/lib (inversion de dépendance)
    {
      name: 'no-app-in-lib',
      severity: 'error',
      comment: 'src/lib ne doit pas importer src/app (inversion de dépendance)',
      from: { path: 'src/lib/' },
      to: { path: 'src/app/' },
    },
    // Pas d'import de domain dans infrastructure
    {
      name: 'domain-purity',
      severity: 'error',
      comment: 'src/lib/domain ne doit pas importer Prisma (règle non-négociable #7)',
      from: { path: 'src/lib/domain/' },
      to: { path: 'node_modules/@prisma/client' },
    },
    {
      name: 'domain-purity-2',
      severity: 'error',
      from: { path: 'src/lib/domain/' },
      to: { path: 'src/lib/prisma' },
    },
    // Pas d'import orphelin (non utilisé)
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, path: 'src/' },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    reporterOptions: {
      text: {},
    },
  },
};
