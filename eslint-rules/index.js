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
        "schoolpro/require-tenant-id": "error",
        "schoolpro/require-site-filter": "error",
        "schoolpro/require-annee-filter": "warn",
      },
    },
  },
};
