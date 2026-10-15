"use client"

import type { RuleSet } from "@/domain/rules/types"
import { DatasetEditorShell } from "../dataset-editor-shell"
import type { DatasetStatusInfo } from "../types"
import { RulesEditor } from "./rules-editor"

/** Pagina delle regole costruttive (9.6). */
export function RegolePage({ status, ruleSet, canWrite }: { status: DatasetStatusInfo; ruleSet: RuleSet; canWrite: boolean }) {
  return (
    <DatasetEditorShell status={status} canPublish={canWrite}>
      <p className="text-sm text-muted-foreground">
        Regole valutate dal configuratore interno e dal preventivo online. Alla pubblicazione ogni tipologia visibile sul sito viene generata con i parametri di default: se una regola
        bloccante la rende non generabile la pubblicazione è rifiutata.
      </p>
      <RulesEditor ruleSet={ruleSet} readOnly={!canWrite} />
    </DatasetEditorShell>
  )
}
