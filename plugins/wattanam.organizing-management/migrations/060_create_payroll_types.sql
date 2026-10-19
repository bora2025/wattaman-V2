-- wattanam-plugin-migration: 060_create_payroll_types
CREATE TABLE plugin_wattanam_organizing_management_payroll_type (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "allowancesMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("allowancesMinor" >= 0),
  "overtimePayMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("overtimePayMinor" >= 0),
  "bonusesMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("bonusesMinor" >= 0),
  "reimbursementsMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("reimbursementsMinor" >= 0),
  "leaveAdjustmentMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("leaveAdjustmentMinor" >= 0),
  "retirementContributionMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("retirementContributionMinor" >= 0),
  "insurancePremiumMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("insurancePremiumMinor" >= 0),
  "loanRecoveryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("loanRecoveryMinor" >= 0),
  "lossOfPayMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("lossOfPayMinor" >= 0),
  "otherPostTaxDeductionMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("otherPostTaxDeductionMinor" >= 0),
  "incomeTaxMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("incomeTaxMinor" >= 0),
  "socialSecurityMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("socialSecurityMinor" >= 0),
  "localTaxMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("localTaxMinor" >= 0),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
