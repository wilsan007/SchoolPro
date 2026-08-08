"use strict";

const requireTenantId = require("./require-tenant-id");
const requireSiteFilter = require("./require-site-filter");

module.exports = {
  rules: {
    "require-tenant-id": requireTenantId,
    "require-site-filter": requireSiteFilter,
  },
  configs: {
    recommended: {
      plugins: ["ecolpro"],
      rules: {
        "ecolpro/require-tenant-id": "error",
        "ecolpro/require-site-filter": "error",
      },
    },
  },
};
