-- wattanam-plugin-migration: 057_expand_audit_ready_payroll
ALTER TABLE plugin_wattanam_organizing_management_payroll_record
  ADD COLUMN "allowancesMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("allowancesMinor" >= 0),
  ADD COLUMN "overtimePayMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("overtimePayMinor" >= 0),
  ADD COLUMN "bonusesMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("bonusesMinor" >= 0),
  ADD COLUMN "reimbursementsMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("reimbursementsMinor" >= 0),
  ADD COLUMN "leaveAdjustmentMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("leaveAdjustmentMinor" >= 0),
  ADD COLUMN "retirementContributionMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("retirementContributionMinor" >= 0),
  ADD COLUMN "insurancePremiumMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("insurancePremiumMinor" >= 0),
  ADD COLUMN "loanRecoveryMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("loanRecoveryMinor" >= 0),
  ADD COLUMN "lossOfPayMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("lossOfPayMinor" >= 0),
  ADD COLUMN "otherPostTaxDeductionMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("otherPostTaxDeductionMinor" >= 0),
  ADD COLUMN "incomeTaxMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("incomeTaxMinor" >= 0),
  ADD COLUMN "socialSecurityMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("socialSecurityMinor" >= 0),
  ADD COLUMN "localTaxMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("localTaxMinor" >= 0),
  ADD COLUMN "grossPayMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("grossPayMinor" >= 0),
  ADD COLUMN "totalDeductionsMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("totalDeductionsMinor" >= 0),
  ADD COLUMN "totalTaxesMinor" INTEGER NOT NULL DEFAULT 0 CHECK ("totalTaxesMinor" >= 0);
