/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'sim-stays-pure',
      severity: 'error',
      comment:
        'sim may only depend on content; it must never import agent, integrations or server.',
      from: { path: '^packages/sim' },
      to: { path: '^(packages/agent|packages/integrations|apps/server)' },
    },
    {
      name: 'content-has-no-deps',
      severity: 'error',
      comment:
        'content is the base of the dependency graph and must not import any other workspace package.',
      from: { path: '^packages/content' },
      to: {
        path: '^(packages/sim|packages/db|packages/agent|packages/integrations|apps/server|apps/web)',
      },
    },
    {
      name: 'web-stays-client-side',
      severity: 'error',
      comment:
        'web may only use content for display data and types; it must never import server-side packages.',
      from: { path: '^apps/web' },
      to: { path: '^(packages/sim|packages/db|packages/agent|packages/integrations|apps/server)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Dependency cycles between workspace packages are not allowed.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
