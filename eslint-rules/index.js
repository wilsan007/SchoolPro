"use strict";

const requireTenantId = require("./require-tenant-id");
const requireSiteFilter = require("./require-site-filter");
const requireAnneeFilter = require("./require-annee-filter");

module.exports = {
  rules: {
    "require-tenant-id": requireTenantId,
    "require-site-filter": requireSiteFilter,
    "require-annee-filter": requireAnneeFilter,
  },
  configs: {
    recommended: {
      plugins: ["ecolpro"],
      rules: {
        "ecolpro/require-tenant-id": "error",
        "ecolpro/require-site-filter": "error",
        "ecolpro/require-annee-filter": "warn",
      },
    },
  },
};
