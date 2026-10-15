"use client"

import * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ParamFields, StaleNotice } from "./param-form"
import { TypologyChooser } from "./typology-picker"

/** Contenuto del pannello parametri: sezioni richiudibili (tipologia, sezioni, ingombro). */
export function ParamsPanel({ envelope }: { envelope?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <StaleNotice />
      <Accordion type="multiple" defaultValue={["tipologia", "sezioni", "ingombro"]}>
        <AccordionItem value="tipologia">
          <AccordionTrigger className="py-3 text-sm">Tipologia e dimensioni</AccordionTrigger>
          <AccordionContent className="space-y-4 px-1">
            <TypologyChooser />
            <ParamFields part="main" />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="sezioni">
          <AccordionTrigger className="py-3 text-sm">Sezioni per famiglia</AccordionTrigger>
          <AccordionContent className="px-1">
            <ParamFields part="sections" />
          </AccordionContent>
        </AccordionItem>
        {envelope && (
          <AccordionItem value="ingombro" className="border-b-0">
            <AccordionTrigger className="py-3 text-sm">Ingombro del cliente</AccordionTrigger>
            <AccordionContent className="px-1">{envelope}</AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  )
}
