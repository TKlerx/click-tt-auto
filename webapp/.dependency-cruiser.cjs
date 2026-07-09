module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment:
        "Circular runtime dependencies make route and service changes harder to reason about.",
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"],
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
  },
};
