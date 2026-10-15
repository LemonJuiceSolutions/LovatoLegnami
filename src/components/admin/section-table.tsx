"use client"

import * as React from "react"
import { useDraft } from "./draft-context"
import { EditableTable, type EditableTableProps } from "./editable-table"

/**
 * `EditableTable` collegata alla bozza della pagina: al salvataggio trasforma le righe nel
 * valore della porzione (`toValue`) e lo scrive al percorso `path` del documento.
 */
export function SectionTable<R extends Record<string, unknown>>({
  path,
  toValue,
  ...table
}: Omit<EditableTableProps<R>, "onSave"> & { path: string; toValue: (rows: R[]) => unknown }) {
  const { save } = useDraft()
  return <EditableTable {...table} onSave={(rows) => save(path, toValue(rows))} />
}
